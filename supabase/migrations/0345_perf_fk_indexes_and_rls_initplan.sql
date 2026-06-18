-- 0345_perf_fk_indexes_and_rls_initplan.sql
-- Performance hardening flagged by the repo's schema-health invariants
-- (src/test/integration/schema-health.test.ts) + the Supabase advisor.
-- PURELY performance: additive indexes + a one-time, value-preserving rewrite of
-- auth.uid() -> (select auth.uid()) in 6 named policies. No authorization, RLS
-- BEHAVIOUR, entitlement, hierarchy, or treasury change.
--
-- Why the RLS rewrite is semantically identical: auth.uid() is STABLE within a
-- statement, so the scalar subquery (select auth.uid()) returns the SAME value;
-- wrapping only changes WHEN it is evaluated (once per query instead of once per
-- row — Postgres "initplan"). USING/WITH CHECK logic, command, and roles are
-- untouched. Idempotent (normalise-then-wrap; ALTER POLICY re-sets the same form).

-- ── Part 1: covering indexes for the 4 erp_% FKs the invariant flags ──────────
create index if not exists erp_customer_requests_customer_idx on public.erp_customer_requests(customer_id);
create index if not exists erp_loyalty_ledger_customer_idx    on public.erp_loyalty_ledger(customer_id);
create index if not exists erp_product_batches_product_idx    on public.erp_product_batches(product_id);
create index if not exists erp_product_batches_supplier_idx   on public.erp_product_batches(supplier_id);

-- ── Part 2: wrap auth.uid() in the 6 flagged policies (value-preserving) ──────
do $$
declare
  p record;
  v_using text;
  v_check text;
  wrap_norm constant text := '\(\s*select\s+auth\.uid\(\)\s*\)';  -- existing wrap → unwrap first (idempotent)
begin
  for p in
    select c.relname as tbl, pol.polname,
           pg_get_expr(pol.polqual, pol.polrelid)      as q,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as wc
    from pg_policy pol
    join pg_class c     on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pol.polname in (
        'erp_cash_handover_read','erp_cash_handover_write',
        'erp_customer_requests_read','erp_customer_requests_write',
        'erp_field_ux_events_insert','erp_visit_outcomes_insert')
  loop
    v_using := p.q;
    v_check := p.wc;
    if v_using is not null then
      v_using := replace(regexp_replace(v_using, wrap_norm, 'auth.uid()', 'g'), 'auth.uid()', '(select auth.uid())');
    end if;
    if v_check is not null then
      v_check := replace(regexp_replace(v_check, wrap_norm, 'auth.uid()', 'g'), 'auth.uid()', '(select auth.uid())');
    end if;

    if v_using is not null and v_check is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.polname, p.tbl, v_using, v_check);
    elsif v_using is not null then
      execute format('alter policy %I on public.%I using (%s)', p.polname, p.tbl, v_using);
    elsif v_check is not null then
      execute format('alter policy %I on public.%I with check (%s)', p.polname, p.tbl, v_check);
    end if;
  end loop;
end $$;
