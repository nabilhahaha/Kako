-- ============================================================================
-- 0270 — Branch governance: Company Admin manages branches WITHIN their tenant
-- ----------------------------------------------------------------------------
-- Two corrections to erp_branches RLS:
--  1) Branch create/edit was super-admin only — a Company Admin must manage
--     their OWN company's branches.
--  2) The prior `erp_branches_access` policy was FOR ALL with a *membership*
--     predicate (`id IN erp_user_branch_ids()`), which let ANY branch member
--     (e.g. a GM, supervisor) WRITE their branch. That is tightened to read-only.
--
-- New model (all tenant-scoped — no cross-tenant path):
--   • SELECT: branch members see their branches; a Company Admin sees ALL of
--     their company's branches; super-admin / platform owner see all.
--   • INSERT/UPDATE/DELETE: ONLY a Company Admin of that company (doubly scoped:
--     company_id = erp_user_company_id() AND erp_is_company_admin(company_id)),
--     or super-admin / platform owner. Role-KEY creation stays platform-only.
-- Server actions additionally force company_id = erp_user_company_id() on writes.
-- ============================================================================
DROP POLICY IF EXISTS erp_branches_access ON erp_branches;
DROP POLICY IF EXISTS erp_branches_company_admin ON erp_branches;

CREATE POLICY erp_branches_select ON erp_branches FOR SELECT
  USING (
    id = ANY (erp_user_branch_ids())
    OR erp_is_platform_owner()
    OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  );

CREATE POLICY erp_branches_write ON erp_branches FOR ALL
  USING (
    erp_is_platform_owner()
    OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  )
  WITH CHECK (
    erp_is_platform_owner()
    OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  );
