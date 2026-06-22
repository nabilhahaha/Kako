-- 0357: schema-health fixes for the Phase 0 access table (0353), applied as a
-- follow-up so 0353 stays byte-identical to PR #310. Satisfies two integration-test
-- invariants:
--   * every foreign key has a covering index
--   * no RLS policy calls auth.uid() unwrapped (must be (select auth.uid()))

-- FK covering index for erp_route_planner_access.granted_by.
CREATE INDEX IF NOT EXISTS idx_rp_access_granted_by ON erp_route_planner_access (granted_by);

-- Recreate the SELECT policy with the wrapped auth.uid() (init-plan invariant).
DROP POLICY IF EXISTS rp_access_select ON erp_route_planner_access;
CREATE POLICY rp_access_select ON erp_route_planner_access FOR SELECT
  USING (
    erp_is_platform_owner()
    OR erp_is_super_admin()
    OR user_id = (select auth.uid())
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  );
