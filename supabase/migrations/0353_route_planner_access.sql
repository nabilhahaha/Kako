-- 0353: Route Planner Access — the product-scoped role / feature / scope model
-- for the Route Planner experience (Field Missions Phase 0).
--
-- SELF-CONTAINED by design: this does NOT touch, depend on, or modify the global
-- VANTORA module/permission system (erp_company_modules, erp_role_permissions,
-- erp_temporary_access_grants, …). Route Planner access lives ONLY in this table
-- and is managed exclusively from /planner-admin.
--
-- ADDITIVE + DEFAULT-PERMISSIVE: when a user has NO access row, the resolver (and
-- the DB helpers below) treat them as FULLY unrestricted — every feature, company
-- scope — so today's Route Planner tenants behave EXACTLY as before. Restriction
-- begins only once an explicit row is written for that user. This makes the table
-- inert until the Route Planner Admin starts assigning roles in Phase 6.
--
-- Roles  : route_planner_admin | manager | area_manager | supervisor | field_user
-- Features: route_planning | day_planner | field_missions | reports
-- Scope  : company | region | area | team | self   (team = a supervisor's reports)

CREATE TABLE IF NOT EXISTS erp_route_planner_access (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES erp_profiles(id)  ON DELETE CASCADE,
  -- Role inside the Route Planner product (NOT a global BranchRole).
  role          text NOT NULL DEFAULT 'field_user',
  -- Which Route Planner capabilities this user may open.
  features      text[] NOT NULL DEFAULT ARRAY['route_planning','day_planner','field_missions','reports']::text[],
  -- Hierarchy scope — authoritative; role only supplies a default. ("Do not rely
  -- only on role name.")
  scope_level   text NOT NULL DEFAULT 'self',
  region_id     uuid REFERENCES erp_regions(id) ON DELETE SET NULL,
  area_id       uuid REFERENCES erp_areas(id)   ON DELETE SET NULL,
  -- team = the users who report to this supervisor (erp_user_branches.reports_to).
  supervisor_id uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  -- Reserved for a future explicit teams table; plain uuid for now (no FK).
  team_id       uuid,
  is_active     boolean NOT NULL DEFAULT true,
  granted_by    uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_access_role_chk
    CHECK (role IN ('route_planner_admin','manager','area_manager','supervisor','field_user')),
  CONSTRAINT rp_access_scope_chk
    CHECK (scope_level IN ('company','region','area','team','self'))
);

-- At most ONE access row per (company, user).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rp_access_company_user
  ON erp_route_planner_access (company_id, user_id);
-- FK covering indexes (schema-health invariant).
CREATE INDEX IF NOT EXISTS idx_rp_access_company    ON erp_route_planner_access (company_id);
CREATE INDEX IF NOT EXISTS idx_rp_access_user       ON erp_route_planner_access (user_id);
CREATE INDEX IF NOT EXISTS idx_rp_access_region     ON erp_route_planner_access (region_id);
CREATE INDEX IF NOT EXISTS idx_rp_access_area       ON erp_route_planner_access (area_id);
CREATE INDEX IF NOT EXISTS idx_rp_access_supervisor ON erp_route_planner_access (supervisor_id);

ALTER TABLE erp_route_planner_access ENABLE ROW LEVEL SECURITY;

-- Read: a user always sees their OWN row; company admins see every row in their
-- company; platform owner / super admin see all. (The /planner-admin console reads
-- and writes via the service-role client, which bypasses RLS — these policies are
-- the belt for any authenticated-path access.)
DROP POLICY IF EXISTS rp_access_select ON erp_route_planner_access;
CREATE POLICY rp_access_select ON erp_route_planner_access FOR SELECT
  USING (
    erp_is_platform_owner()
    OR erp_is_super_admin()
    OR user_id = auth.uid()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  );

-- Write: company admins of the SAME company, platform owner, or super admin only.
DROP POLICY IF EXISTS rp_access_write ON erp_route_planner_access;
CREATE POLICY rp_access_write ON erp_route_planner_access FOR ALL
  USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  )
  WITH CHECK (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  );

-- ── DB helpers (reused by later Field-Mission RLS phases) ────────────────────

-- The caller's Route Planner role for a company; NULL when they have no row.
CREATE OR REPLACE FUNCTION rp_access_role(p_company uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT role FROM erp_route_planner_access
  WHERE company_id = p_company AND user_id = auth.uid() AND is_active
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION rp_access_role(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION rp_access_role(uuid) TO authenticated;

-- Does the caller hold a Route Planner feature? DEFAULT-PERMISSIVE: TRUE when the
-- user has NO access row (today's tenants stay unrestricted until a row exists).
CREATE OR REPLACE FUNCTION rp_has_feature(p_company uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT p_feature = ANY(features) FROM erp_route_planner_access
       WHERE company_id = p_company AND user_id = auth.uid() AND is_active LIMIT 1),
    true);
$$;
REVOKE ALL ON FUNCTION rp_has_feature(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION rp_has_feature(uuid, text) TO authenticated;

-- The caller's scope level for a company; 'company' (widest) when they have no row.
CREATE OR REPLACE FUNCTION rp_scope_level(p_company uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT scope_level FROM erp_route_planner_access
       WHERE company_id = p_company AND user_id = auth.uid() AND is_active LIMIT 1),
    'company');
$$;
REVOKE ALL ON FUNCTION rp_scope_level(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION rp_scope_level(uuid) TO authenticated;

-- Rollback (manual):
--   DROP FUNCTION rp_scope_level(uuid), rp_has_feature(uuid,text), rp_access_role(uuid);
--   DROP TABLE erp_route_planner_access;
