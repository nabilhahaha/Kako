-- ============================================================================
-- 0084: Wire platform-staff granular permissions into cross-tenant access.
-- ----------------------------------------------------------------------------
-- Additive ONLY. Existing policies are NOT modified — these are SEPARATE
-- permissive policies, which Postgres OR's with the current ones. They let an
-- internal employee with the relevant platform permission read (and, for
-- companies, create/bill) tenant rows the Platform Owner already could. Tenant
-- members and the owner keep exactly the access they have today.
--
--   view_companies     -> read erp_companies / erp_branches / erp_user_branches
--   access_audit_logs  -> read erp_audit_logs
--   create_companies   -> insert erp_companies
--   manage_billing     -> update erp_companies (subscription/lifecycle)
--
-- Note (least privilege): RLS cannot scope an UPDATE to specific columns, so the
-- manage_billing UPDATE policy technically permits writing any column of a
-- company row. This is mitigated by (a) the server action only writing billing/
-- lifecycle columns, (b) all changes being audit-logged, and (c) staff being
-- trusted internal employees. Deeper tenant controls (branch/user provisioning,
-- password reset, module/permission management) remain OWNER-ONLY.
-- ============================================================================

-- ── Reads ────────────────────────────────────────────────────────────────────
drop policy if exists erp_companies_staff_read on erp_companies;
create policy erp_companies_staff_read on erp_companies
  for select using ((select erp_platform_has('view_companies')));

drop policy if exists erp_branches_staff_read on erp_branches;
create policy erp_branches_staff_read on erp_branches
  for select using ((select erp_platform_has('view_companies')));

drop policy if exists erp_user_branches_staff_read on erp_user_branches;
create policy erp_user_branches_staff_read on erp_user_branches
  for select using ((select erp_platform_has('view_companies')));

drop policy if exists erp_audit_logs_staff_read on erp_audit_logs;
create policy erp_audit_logs_staff_read on erp_audit_logs
  for select using ((select erp_platform_has('access_audit_logs')));

-- ── Company writes (scoped permissions) ──────────────────────────────────────
drop policy if exists erp_companies_staff_insert on erp_companies;
create policy erp_companies_staff_insert on erp_companies
  for insert with check ((select erp_platform_has('create_companies')));

drop policy if exists erp_companies_staff_update on erp_companies;
create policy erp_companies_staff_update on erp_companies
  for update using ((select erp_platform_has('manage_billing')))
           with check ((select erp_platform_has('manage_billing')));
