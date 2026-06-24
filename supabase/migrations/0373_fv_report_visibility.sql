-- ============================================================================
-- 0373: Field Verification — report visibility for authorized viewers.
--
-- Problem: rp_verif_sel / rp_attempt_sel (0367/0368) only let a row be read by the
-- platform/super admin, the company admin, the OWNING rep (rep_id = auth.uid()), or a
-- user the reporting graph makes visible (rp_can_see_user). In a Field-Verification-only
-- company the reporting graph isn't configured, so a Supervisor or Viewer/Reporter — who
-- legitimately hold `field_verification.reports` — read NO rows, and the reports + photos
-- come back empty.
--
-- Fix (additive, read-only, company-scoped): allow SELECT for any company user who holds
-- `field_verification.reports`. erp_fv_can_view_reports() wraps the existing per-role
-- permission resolver (erp_user_has_permission) so RLS can call it. Company isolation
-- (company_id = erp_user_company_id()) is preserved → no cross-company exposure. The rep's
-- own-row access and the admin/super/owner branches are unchanged. No data is modified.
-- Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_fv_can_view_reports()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT erp_user_has_permission(erp_user_company_id(), 'field_verification.reports');
$$;
REVOKE ALL ON FUNCTION erp_fv_can_view_reports() FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_can_view_reports() TO authenticated;

-- Completed verifications: + report-permission holders (read-only).
DROP POLICY IF EXISTS rp_verif_sel ON erp_rp_customer_verifications;
CREATE POLICY rp_verif_sel ON erp_rp_customer_verifications FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rep_id = (select auth.uid())
          OR rp_can_see_user(rep_id, company_id)
          OR erp_fv_can_view_reports())));

-- Verification attempts (exception report): same visibility rule.
DROP POLICY IF EXISTS rp_attempt_sel ON erp_rp_verification_attempts;
CREATE POLICY rp_attempt_sel ON erp_rp_verification_attempts FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rep_id = (select auth.uid())
          OR rp_can_see_user(rep_id, company_id)
          OR erp_fv_can_view_reports())));
