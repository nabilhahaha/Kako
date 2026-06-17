-- ============================================================================
-- 0271 — Tenant-scoped member list for governance screens (Authz Console)
-- ----------------------------------------------------------------------------
-- Governance screens (Roles & Permissions / User-Scope) listed members from a
-- direct erp_user_branches query, which is MEMBERSHIP-scoped — so a Company Admin
-- only saw users in THEIR branch, not the whole tenant.
--
-- This RPC sources members from the role-scoped visibility model
-- (erp_visible_user_ids), within the caller's OWN company. No RLS is broadened
-- (the function is SECURITY DEFINER but re-applies erp_visible_user_ids), so all
-- existing isolation is preserved and nothing leaks outside the tenant:
--   • Company Admin → all users in their tenant
--   • Supervisor    → their team (reports_to subtree)
--   • Area / Regional Manager → users in their region
--   • Sales Rep     → only themselves
-- Returns one row per (user, role) membership so the console can show role keys.
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_scoped_members()
RETURNS TABLE(user_id uuid, role text, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT ub.user_id, ub.role, p.full_name, p.email
  FROM erp_user_branches ub
  JOIN erp_branches b ON b.id = ub.branch_id
  JOIN erp_profiles p ON p.id = ub.user_id
  WHERE b.company_id = erp_user_company_id()
    AND ub.user_id IN (SELECT erp_visible_user_ids());
$$;

GRANT EXECUTE ON FUNCTION erp_scoped_members() TO authenticated, service_role;
