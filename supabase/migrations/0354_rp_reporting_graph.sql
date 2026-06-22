-- 0354: Reporting Graph persistence (Blueprint Rev.2).
--
-- Separates the THREE independent concepts:
--   * Permissions      -> role + features[]   (already on erp_route_planner_access)
--   * Reporting         -> primary/secondary manager edges (added here)
--   * Visibility scope  -> DERIVED from the reporting graph (rp_visible_users), NOT
--                          from role names or a fixed Region/Area/Team template.
--
-- No fixed hierarchy: any role may report to any role; only the company root is
-- mandatory. The legacy scope_level / region_id / area_id / team_id columns remain as
-- TERRITORY attributes (independent of reporting) and are no longer the visibility
-- mechanism. NOT APPLIED to staging yet — for review.

-- ── Reporting edges + company-wide override ─────────────────────────────────
ALTER TABLE erp_route_planner_access
  ADD COLUMN IF NOT EXISTS primary_manager_id   uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS secondary_manager_id uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  -- Deliberate company-wide visibility (Company Admin / Director). Opt-in; NEVER
  -- inferred from the role name.
  ADD COLUMN IF NOT EXISTS see_all boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rp_access_primary_mgr   ON erp_route_planner_access (primary_manager_id);
CREATE INDEX IF NOT EXISTS idx_rp_access_secondary_mgr ON erp_route_planner_access (secondary_manager_id);

-- ── Visibility resolver: the caller's reporting subtree (self + everyone who
--    reports to them, directly or transitively, via primary OR secondary edges).
--    see_all short-circuits to the whole company. UNION (not UNION ALL) makes the
--    recursion cycle-safe. STABLE; resolved per request. ─────────────────────
CREATE OR REPLACE FUNCTION rp_visible_users(p_company uuid)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_me uuid := auth.uid();
  v_see_all boolean;
BEGIN
  IF v_me IS NULL OR p_company IS NULL THEN
    RETURN;
  END IF;

  SELECT a.see_all INTO v_see_all
    FROM erp_route_planner_access a
    WHERE a.company_id = p_company AND a.user_id = v_me AND a.is_active
    LIMIT 1;

  IF COALESCE(v_see_all, false) THEN
    RETURN QUERY SELECT a.user_id FROM erp_route_planner_access a WHERE a.company_id = p_company;
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE subtree AS (
    SELECT a.user_id
      FROM erp_route_planner_access a
      WHERE a.company_id = p_company AND a.user_id = v_me
    UNION
    SELECT a.user_id
      FROM erp_route_planner_access a
      JOIN subtree s
        ON (a.primary_manager_id = s.user_id OR a.secondary_manager_id = s.user_id)
      WHERE a.company_id = p_company
  )
  SELECT s.user_id FROM subtree s;
END;
$$;
REVOKE ALL ON FUNCTION rp_visible_users(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION rp_visible_users(uuid) TO authenticated;

-- Convenience predicate for RLS: is p_target inside the caller's visibility?
CREATE OR REPLACE FUNCTION rp_can_see_user(p_target uuid, p_company uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT p_target = auth.uid()
      OR EXISTS (SELECT 1 FROM rp_visible_users(p_company) v WHERE v.user_id = p_target);
$$;
REVOKE ALL ON FUNCTION rp_can_see_user(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION rp_can_see_user(uuid, uuid) TO authenticated;

-- Rollback (manual):
--   DROP FUNCTION rp_can_see_user(uuid,uuid), rp_visible_users(uuid);
--   ALTER TABLE erp_route_planner_access
--     DROP COLUMN see_all, DROP COLUMN secondary_manager_id, DROP COLUMN primary_manager_id;
