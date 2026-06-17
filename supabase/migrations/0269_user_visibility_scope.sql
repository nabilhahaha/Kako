-- ============================================================================
-- 0269 — Role-scoped user visibility (strict role isolation)
-- ----------------------------------------------------------------------------
-- Problem: erp_profiles SELECT allowed seeing ALL branch-mates, so a rep's
-- user-selectors (Visit Plan, Customers, Settlement, Warehouses) listed managers
-- and admins. We scope who a user may SEE/ASSIGN by org role:
--
--   • platform owner / super admin            → everyone
--   • admin / manager / national_sales_manager
--     / sales_director                        → all users in their company
--   • regional_manager / area_manager         → users in their region's branches
--   • supervisor                              → their reports_to subtree (team)
--   • everyone else (rep/cash_van/merch/…)    → only themselves
--
-- Enforced at the DB (RLS on erp_profiles) so EVERY profile read — selectors,
-- lookups, search, name-resolvers, present and future — is scoped. The API layer
-- (scoped RPC erp_assignable_reps + write checks) and UI build on top.
-- ============================================================================

-- Transitive reports_to subtree of the current user (self + all who roll up).
CREATE OR REPLACE FUNCTION erp_subordinate_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE tree AS (
    SELECT auth.uid() AS uid
    UNION
    SELECT ub.user_id FROM erp_user_branches ub JOIN tree ON ub.reports_to = tree.uid
  )
  SELECT uid FROM tree;
$$;

-- The set of user ids the current user may see / assign, by org role.
CREATE OR REPLACE FUNCTION erp_visible_user_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  -- self
  SELECT auth.uid()
  UNION
  -- platform owner / super admin → everyone
  SELECT p.id FROM erp_profiles p WHERE erp_is_platform_owner() OR erp_is_super_admin()
  UNION
  -- company-wide management → all users sharing a company with the caller's
  -- company-wide membership
  SELECT t.user_id
    FROM erp_user_branches me
    JOIN erp_branches mb ON mb.id = me.branch_id
    JOIN erp_branches tb ON tb.company_id = mb.company_id
    JOIN erp_user_branches t ON t.branch_id = tb.id
   WHERE me.user_id = auth.uid()
     AND me.role IN ('admin','manager','national_sales_manager','sales_director')
  UNION
  -- regional / area management → users in branches of the caller's region(s)
  SELECT t.user_id
    FROM erp_user_branches me
    JOIN erp_branches mb ON mb.id = me.branch_id AND mb.region_id IS NOT NULL
    JOIN erp_branches tb ON tb.region_id = mb.region_id
    JOIN erp_user_branches t ON t.branch_id = tb.id
   WHERE me.user_id = auth.uid()
     AND me.role IN ('regional_manager','area_manager')
  UNION
  -- supervisor → their team (reports_to subtree)
  SELECT s.uid
    FROM erp_subordinate_ids() AS s(uid)
   WHERE EXISTS (SELECT 1 FROM erp_user_branches me
                  WHERE me.user_id = auth.uid() AND me.role = 'supervisor');
$$;

-- Per-target predicate (for write checks / RLS).
CREATE OR REPLACE FUNCTION erp_can_see_user(p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_user = auth.uid()
      OR erp_is_super_admin() OR erp_is_platform_owner()
      OR p_user IN (SELECT erp_visible_user_ids());
$$;

-- API-layer selector source: the visible, assignable users (active, non-vendor).
CREATE OR REPLACE FUNCTION erp_assignable_reps()
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.full_name, p.email
  FROM erp_profiles p
  WHERE p.is_active
    AND COALESCE(p.is_platform_owner, false) = false
    AND p.id IN (SELECT erp_visible_user_ids())
  ORDER BY p.full_name NULLS LAST, p.email;
$$;

GRANT EXECUTE ON FUNCTION erp_subordinate_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_visible_user_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_can_see_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_assignable_reps() TO authenticated, service_role;

-- ── Tighten erp_profiles SELECT: replace the "any branch-mate" rule with the
--    role-scoped visible set. Self / super / platform retained.
DROP POLICY IF EXISTS erp_profiles_select ON erp_profiles;
CREATE POLICY erp_profiles_select ON erp_profiles FOR SELECT
  USING (
    id = (SELECT auth.uid())
    OR (SELECT erp_is_super_admin())
    OR (SELECT erp_is_platform_owner())
    OR id IN (SELECT erp_visible_user_ids())
  );
