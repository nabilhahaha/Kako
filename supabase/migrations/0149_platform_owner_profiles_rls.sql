-- ============================================================================
-- 0149: Platform owner is the apex authority on erp_profiles (RLS consistency)
-- ----------------------------------------------------------------------------
-- Before: only `erp_is_super_admin()` (plus self + branch-mates) could read,
-- and only super admin (plus self) could update/delete, erp_profiles. A *pure*
-- platform owner (is_platform_owner=true, is_super_admin=false) — or platform
-- staff — could therefore NOT read tenant users, breaking the "Platform Owner
-- sees All users" guarantee. It only worked because both live owners also carry
-- is_super_admin. This adds `erp_is_platform_owner()` so the vendor owner tier is
-- consistent with its existing cross-tenant access to erp_companies / customers /
-- company_modules / company_roles.
--
-- Tenant isolation is UNCHANGED: a tenant user still sees only itself + users who
-- share one of its branches. Verified post-apply:
--   pure owner  → 61 profiles / 44 companies   (full visibility)
--   tenant user →  4 profiles /  1 company      (isolated)
--
-- Reversible. Rollback = re-run the ALTER POLICY statements below WITHOUT the
-- `OR (SELECT erp_is_platform_owner())` clause (see docs/AUTHORIZATION.md §7).
-- ============================================================================

ALTER POLICY erp_profiles_select ON erp_profiles
  USING (
    (id = (SELECT auth.uid()))
    OR (SELECT erp_is_super_admin())
    OR (SELECT erp_is_platform_owner())
    OR (id IN (SELECT ub.user_id FROM erp_user_branches ub
               WHERE ub.branch_id = ANY((SELECT erp_user_branch_ids())::uuid[])))
  );

ALTER POLICY erp_profiles_update ON erp_profiles
  USING (
    (id = (SELECT auth.uid()))
    OR (SELECT erp_is_super_admin())
    OR (SELECT erp_is_platform_owner())
  )
  WITH CHECK (
    (id = (SELECT auth.uid()))
    OR (SELECT erp_is_super_admin())
    OR (SELECT erp_is_platform_owner())
  );

ALTER POLICY erp_profiles_delete ON erp_profiles
  USING (
    (SELECT erp_is_super_admin())
    OR (SELECT erp_is_platform_owner())
  );
