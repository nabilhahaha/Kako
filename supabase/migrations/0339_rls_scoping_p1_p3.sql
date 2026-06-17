-- 0339_rls_scoping_p1_p3.sql
-- Data-scoping remediation P1–P3 (from the Customer/Team Data Scoping Audit).
-- Tightens RLS so reps no longer see other reps' financial/request data. Both the
-- SELECT and the ALL policy on each table are updated (a permissive ALL policy also
-- grants SELECT, so leaving it broad would keep the leak). App writes go through
-- SECURITY DEFINER RPCs, so the WITH CHECK changes do not affect normal flows.
--
-- Supervisor remains BRANCH-scoped here; the team-only (reports_to) tightening is
-- Priority 4 and is handled separately after the hierarchy model is confirmed.

begin;

-- ── P1 Collections: rep/customer-scoped (consistent with erp_invoices), not branch-wide.
alter policy erp_collections_select on erp_collections using (
  case when erp_user_is_company_wide() then (branch_id = any (erp_user_branch_ids()))
       else erp_customer_id_in_scope(customer_id) end);
alter policy erp_collections_manage on erp_collections
  using (
    case when erp_user_is_company_wide() then (branch_id = any (erp_user_branch_ids()))
         else erp_customer_id_in_scope(customer_id) end)
  with check (
    case when erp_user_is_company_wide() then (branch_id = any (erp_user_branch_ids()))
         else erp_customer_id_in_scope(customer_id) end);

-- ── P2 Customer Requests: owner sees own; approver sees their branch; company-wide all.
alter policy erp_customer_requests_read on erp_customer_requests using (
  erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
    erp_user_is_company_wide()
    OR salesman_id = auth.uid()
    OR (erp_user_has_perm('customer.request.approve') AND exists (
         select 1 from erp_user_branches ub
         where ub.user_id = salesman_id and ub.branch_id = any (erp_user_branch_ids()))))));
alter policy erp_customer_requests_write on erp_customer_requests
  using (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide()
      OR salesman_id = auth.uid()
      OR (erp_user_has_perm('customer.request.approve') AND exists (
           select 1 from erp_user_branches ub
           where ub.user_id = salesman_id and ub.branch_id = any (erp_user_branch_ids()))))))
  with check (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide()
      OR salesman_id = auth.uid()
      OR (erp_user_has_perm('customer.request.approve') AND exists (
           select 1 from erp_user_branches ub
           where ub.user_id = salesman_id and ub.branch_id = any (erp_user_branch_ids()))))));

-- ── P3 Cash Handover Requests: owner sees own; confirmer sees branch; company-wide all.
alter policy erp_cash_handover_read on erp_cash_handover_requests using (
  erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
    erp_user_is_company_wide()
    OR salesman_id = auth.uid()
    OR (erp_user_has_perm('cash.handover.confirm') AND exists (
         select 1 from erp_user_branches ub
         where ub.user_id = salesman_id and ub.branch_id = any (erp_user_branch_ids()))))));
alter policy erp_cash_handover_write on erp_cash_handover_requests
  using (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide()
      OR salesman_id = auth.uid()
      OR (erp_user_has_perm('cash.handover.confirm') AND exists (
           select 1 from erp_user_branches ub
           where ub.user_id = salesman_id and ub.branch_id = any (erp_user_branch_ids()))))))
  with check (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide()
      OR salesman_id = auth.uid()
      OR (erp_user_has_perm('cash.handover.confirm') AND exists (
           select 1 from erp_user_branches ub
           where ub.user_id = salesman_id and ub.branch_id = any (erp_user_branch_ids()))))));

commit;
