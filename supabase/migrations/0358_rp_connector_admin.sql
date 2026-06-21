-- 0358: Align connector-table write RLS with the UI permission for the Route Planner
-- admin. The Integration connectors (data sources, field mappings, sync runs) are
-- managed by the company admin OR the tenant's Route Planner admin (the
-- route_planner_admin access role, resolved by rp_access_role()). This keeps the UI
-- and the database in lockstep — previously the UI hid the controls for non-company-
-- admins while the DB also blocked them; now both accept route_planner_admin.
--
-- Scope: ONLY the three integration tables. Reporting-graph and approval-flow writes
-- remain company-admin-only (their UI is gated the same way — still aligned).

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['erp_rp_data_sources','erp_rp_field_mappings','erp_rp_sync_runs']) AS tbl
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_wr', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL
      USING (erp_is_platform_owner() OR erp_is_super_admin()
             OR (company_id = erp_user_company_id()
                 AND (erp_is_company_admin(company_id) OR rp_access_role(company_id) = 'route_planner_admin')))
      WITH CHECK (erp_is_platform_owner() OR erp_is_super_admin()
             OR (company_id = erp_user_company_id()
                 AND (erp_is_company_admin(company_id) OR rp_access_role(company_id) = 'route_planner_admin')))$p$,
      r.tbl||'_wr', r.tbl);
  END LOOP;
END $$;

-- Rollback (manual): recreate the *_wr policies without the rp_access_role(...) clause
-- (see migration 0355's DO loop).
