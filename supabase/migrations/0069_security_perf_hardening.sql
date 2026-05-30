-- 0069_security_perf_hardening.sql
-- Hardening pass driven by the Supabase security/performance advisors:
--   (1) pin search_path on the 20 functions flagged `function_search_path_mutable`
--   (2) wrap auth.*()/helper calls in the 11 RLS policies flagged
--       `auth_rls_initplan` in `(select …)` so they evaluate once per query
--       instead of once per row
--   (3) enforce the double-entry invariant at the database level: a journal
--       entry's debits must equal its credits (deferred, checked at commit)

-- ── (1) Pin function search_path ───────────────────────────────────────────
alter function public.erp_approve_stock_request(p_request_id uuid) set search_path = public, pg_temp;
alter function public.erp_company_active(p_company uuid) set search_path = public, pg_temp;
alter function public.erp_complete_sales_return(p_return_id uuid) set search_path = public, pg_temp;
alter function public.erp_complete_transfer(p_transfer_id uuid) set search_path = public, pg_temp;
alter function public.erp_finalize_stock_count(p_count_id uuid) set search_path = public, pg_temp;
alter function public.erp_has_branch_access(p_branch uuid) set search_path = public, pg_temp;
alter function public.erp_issue_invoice(p_invoice_id uuid) set search_path = public, pg_temp;
alter function public.erp_post_payment_voucher(p_id uuid) set search_path = public, pg_temp;
alter function public.erp_post_receipt_voucher(p_id uuid) set search_path = public, pg_temp;
alter function public.erp_receive_purchase_order(p_po_id uuid, p_warehouse_id uuid, p_details jsonb) set search_path = public, pg_temp;
alter function public.erp_record_payment(p_invoice_id uuid, p_amount numeric, p_method erp_payment_method, p_ref text, p_date date) set search_path = public, pg_temp;
alter function public.erp_record_supplier_payment(p_supplier_id uuid, p_branch_id uuid, p_amount numeric, p_method erp_payment_method, p_ref text, p_date date) set search_path = public, pg_temp;
alter function public.erp_set_company_id() set search_path = public, pg_temp;
alter function public.erp_set_updated_at() set search_path = public, pg_temp;
alter function public.erp_trg_journal_on_invoice_issued() set search_path = public, pg_temp;
alter function public.erp_trg_journal_on_payment() set search_path = public, pg_temp;
alter function public.erp_trg_stock_on_receipt_line() set search_path = public, pg_temp;
alter function public.erp_trg_update_inventory_on_movement() set search_path = public, pg_temp;
alter function public.erp_user_branch_ids() set search_path = public, pg_temp;
alter function public.erp_user_company_active() set search_path = public, pg_temp;

-- ── (2) Wrap per-row function calls in RLS policies with (select …) ─────────
-- Catalog/reference reads gated on "is the caller signed in".
alter policy erp_btm_read on erp_business_type_modules using ((select auth.uid()) is not null);
alter policy erp_business_type_roles_read on erp_business_type_roles using ((select auth.uid()) is not null);
alter policy erp_plan_modules_read on erp_plan_modules using ((select auth.uid()) is not null);
alter policy erp_plans_read on erp_plans using ((select auth.uid()) is not null);
alter policy erp_roles_read on erp_roles using ((select auth.uid()) is not null);
alter policy erp_role_permissions_read on erp_role_permissions using ((select auth.uid()) is not null);
alter policy erp_supplier_payments_select on erp_supplier_payments using ((select auth.uid()) is not null);
alter policy erp_supplier_payments_manage on erp_supplier_payments using ((select auth.uid()) is not null);

-- Self/branch-scoped policies.
-- Cast the wrapped array-returning helper back to uuid[] so `= any(…)` keeps
-- its array form (a bare `(select …)` would be parsed as a subquery-ANY).
alter policy erp_user_branches_select on erp_user_branches
  using ((user_id = (select auth.uid())) or (branch_id = any ((select erp_user_branch_ids())::uuid[])));

alter policy erp_profiles_select on erp_profiles
  using (
    (id = (select auth.uid()))
    or (select erp_is_super_admin())
    or (id in (select ub.user_id from erp_user_branches ub where ub.branch_id = any ((select erp_user_branch_ids())::uuid[])))
  );

alter policy erp_profiles_update_self on erp_profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ── (3) Enforce balanced double-entry at the database level ────────────────
create or replace function erp_assert_journal_balanced()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry uuid := coalesce(NEW.journal_entry_id, OLD.journal_entry_id);
  v_debit numeric;
  v_credit numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_debit, v_credit
    from erp_journal_lines
   where journal_entry_id = v_entry;
  -- An entry with no lines (v_debit = v_credit = 0) is allowed; any entry with
  -- lines must balance.
  if round(v_debit, 2) <> round(v_credit, 2) then
    raise exception 'Journal entry % is unbalanced: debit % <> credit %', v_entry, v_debit, v_credit
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

-- Trigger functions fire with the trigger's rights regardless of EXECUTE
-- grants, so deny direct execution entirely.
revoke all on function erp_assert_journal_balanced() from public, anon, authenticated;

drop trigger if exists erp_journal_lines_balanced on erp_journal_lines;
create constraint trigger erp_journal_lines_balanced
  after insert or update or delete on erp_journal_lines
  deferrable initially deferred
  for each row execute function erp_assert_journal_balanced();
