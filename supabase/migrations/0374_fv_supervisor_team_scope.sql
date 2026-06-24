-- ============================================================================
-- 0374: Field Verification — strict report visibility model (Supervisor = org team).
--
-- This is the FOLLOW-UP to 0373's temporary company-wide supervisor fallback. It moves
-- Supervisors to their ORG TEAM scope (erp_user_branches.reports_to subtree, resolved by the
-- existing recursive helper erp_subordinate_ids) and gives company-wide read to a dedicated
-- `field_verification.reports_all` permission held by Viewer/Reporter, Manager and Admin —
-- NOT Supervisor.
--
-- Final model:
--   Rep        → own rows (rep_id = auth.uid())                           [unchanged]
--   Supervisor → own + org team via erp_subordinate_ids() (reports_to subtree)
--   Viewer/Mgr → company-wide read via field_verification.reports_all
--   Admin      → all company rows (erp_is_company_admin)                  [unchanged]
-- Company-scoped throughout (no cross-company); read-only SELECT policies; no data change.
--
-- ⚠️ ACTIVATION ORDER (so Supervisors don't see empty): apply this ONLY after each FV rep's
-- erp_user_branches.reports_to is set to their Supervisor. Until then keep 0373's company-wide
-- supervisor fallback in place. If a company customizes role permissions
-- (erp_company_role_permissions), also grant field_verification.reports_all there for
-- admin/manager/viewer. Safe to re-run.
-- ============================================================================

-- Company-wide FV reporting permission for Viewer/Reporter, Manager, Admin (NOT Supervisor).
INSERT INTO erp_role_permissions (role_key, permission)
SELECT v.role_key, 'field_verification.reports_all'
FROM (VALUES ('admin'), ('manager'), ('viewer')) AS v(role_key)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION erp_fv_can_view_all_reports()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT erp_user_has_permission(erp_user_company_id(), 'field_verification.reports_all');
$$;
REVOKE ALL ON FUNCTION erp_fv_can_view_all_reports() FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_can_view_all_reports() TO authenticated;

-- Completed verifications: own | org team | company-wide reporter | admin (+ legacy graph).
DROP POLICY IF EXISTS rp_verif_sel ON erp_rp_customer_verifications;
CREATE POLICY rp_verif_sel ON erp_rp_customer_verifications FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rep_id = (select auth.uid())
          OR rep_id IN (SELECT erp_subordinate_ids())     -- Supervisor: org team (reports_to subtree)
          OR erp_fv_can_view_all_reports()                -- Viewer/Reporter/Manager: company-wide
          OR rp_can_see_user(rep_id, company_id))));       -- existing route-planner graph (harmless)

-- Verification attempts (exception report): same visibility rule.
DROP POLICY IF EXISTS rp_attempt_sel ON erp_rp_verification_attempts;
CREATE POLICY rp_attempt_sel ON erp_rp_verification_attempts FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rep_id = (select auth.uid())
          OR rep_id IN (SELECT erp_subordinate_ids())
          OR erp_fv_can_view_all_reports()
          OR rp_can_see_user(rep_id, company_id))));
