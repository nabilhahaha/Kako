-- ============================================================================
-- 0152: Platform owner may manage the GLOBAL role catalog (apex consistency)
-- ----------------------------------------------------------------------------
-- erp_roles / erp_role_permissions writes were super-admin-only. The Global Roles
-- & Permissions UI is an owner-tier feature, so extend writes to the platform
-- owner (matching 0149's profiles change). Reads stay open to any authenticated
-- user (global reference data). Reversible — rollback returns each policy to
-- (erp_is_super_admin()).
-- ============================================================================

ALTER POLICY erp_roles_ins ON erp_roles WITH CHECK (erp_is_super_admin() OR erp_is_platform_owner());
ALTER POLICY erp_roles_upd ON erp_roles USING (erp_is_super_admin() OR erp_is_platform_owner()) WITH CHECK (erp_is_super_admin() OR erp_is_platform_owner());
ALTER POLICY erp_roles_del ON erp_roles USING (erp_is_super_admin() OR erp_is_platform_owner());

ALTER POLICY erp_role_permissions_ins ON erp_role_permissions WITH CHECK (erp_is_super_admin() OR erp_is_platform_owner());
ALTER POLICY erp_role_permissions_upd ON erp_role_permissions USING (erp_is_super_admin() OR erp_is_platform_owner()) WITH CHECK (erp_is_super_admin() OR erp_is_platform_owner());
ALTER POLICY erp_role_permissions_del ON erp_role_permissions USING (erp_is_super_admin() OR erp_is_platform_owner());

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- ALTER POLICY erp_roles_ins ON erp_roles WITH CHECK (erp_is_super_admin());
-- ALTER POLICY erp_roles_upd ON erp_roles USING (erp_is_super_admin()) WITH CHECK (erp_is_super_admin());
-- ALTER POLICY erp_roles_del ON erp_roles USING (erp_is_super_admin());
-- (and the three erp_role_permissions_* policies likewise)
