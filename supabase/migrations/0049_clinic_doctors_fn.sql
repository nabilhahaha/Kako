-- ============================================================================
-- 0049: Clinic — list the doctors of the caller's company
-- ----------------------------------------------------------------------------
-- Multi-doctor clinics: reception assigns a treating doctor to each
-- appointment / visit, and each doctor sees their own queue. This helper
-- returns the company's clinical staff (admin / manager / doctor) so the UI can
-- offer a doctor picker. SECURITY DEFINER so a receptionist can read it without
-- broad profile-table access; scoped to the caller's own company. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_clinic_doctors()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT p.id, p.full_name, p.email
  FROM erp_profiles p
  JOIN erp_user_branches ub ON ub.user_id = p.id
  JOIN erp_branches b ON b.id = ub.branch_id
  WHERE b.company_id = erp_user_company_id()
    AND ub.role IN ('admin', 'manager', 'doctor')
  ORDER BY p.full_name;
$$;

REVOKE ALL ON FUNCTION erp_clinic_doctors() FROM public;
GRANT EXECUTE ON FUNCTION erp_clinic_doctors() TO authenticated;
