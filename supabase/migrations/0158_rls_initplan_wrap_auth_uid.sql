-- ============================================================================
-- 0158: Eliminate per-row auth re-evaluation in RLS (auth_rls_initplan)
-- ----------------------------------------------------------------------------
-- These 6 policies referenced auth.uid() UNWRAPPED, so Postgres re-evaluated it
-- for every scanned row (O(rows)). Wrapping it in (SELECT auth.uid()) makes it an
-- initplan evaluated ONCE per query. Behaviour-identical; pure performance fix.
-- Guarded going forward by src/test/integration/schema-health.test.ts.
-- ============================================================================

ALTER POLICY erp_import_mappings_read ON erp_import_mappings
  USING ((SELECT erp_is_platform_owner())
         OR ((company_id = (SELECT erp_user_company_id())) AND (is_shared OR (created_by = (SELECT auth.uid())))));

ALTER POLICY erp_import_mappings_insert ON erp_import_mappings
  WITH CHECK ((company_id = (SELECT erp_user_company_id())) AND (created_by = (SELECT auth.uid())));

ALTER POLICY erp_import_mappings_update ON erp_import_mappings
  USING ((SELECT erp_is_platform_owner()) OR (created_by = (SELECT auth.uid())) OR (SELECT erp_is_company_admin(company_id)));

ALTER POLICY erp_import_mappings_delete ON erp_import_mappings
  USING ((SELECT erp_is_platform_owner()) OR (created_by = (SELECT auth.uid())) OR (SELECT erp_is_company_admin(company_id)));

ALTER POLICY erp_pstaff_read ON erp_platform_staff
  USING ((SELECT erp_is_platform_owner()) OR (profile_id = (SELECT auth.uid())) OR (SELECT erp_platform_has('manage_users')));

ALTER POLICY erp_psp_read ON erp_platform_staff_permissions
  USING ((SELECT erp_is_platform_owner())
         OR (SELECT erp_platform_has('manage_users'))
         OR (EXISTS (SELECT 1 FROM erp_platform_staff s
                     WHERE s.id = erp_platform_staff_permissions.staff_id
                       AND s.profile_id = (SELECT auth.uid()))));

-- Rollback: replace each (SELECT auth.uid()) with auth.uid() in the above policies.
