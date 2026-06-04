-- ============================================================================
-- 0104: FMCG hierarchy Slice S4a — Hierarchy Scope + RLS (customers + routes)
-- ----------------------------------------------------------------------------
-- Turns the S2 sales-hierarchy roles into SCOPED visibility on erp_customers and
-- erp_routes, enforced at RLS (not just queries). Builds on S1 (regions/areas +
-- branch links), S2 (roles), S3 (customer.region_id/area_id/salesman_id/route_id).
--
-- ZERO REGRESSION: only the five FMCG sales roles are scoped —
--   regional_manager, area_manager, branch_manager, supervisor, salesman.
-- EVERY other role (admin, manager, sales_director, national_sales_manager,
-- accountant=Finance, it_admin, viewer, AND non-sales roles like cashier /
-- warehouse_keeper / staff / driver / doctor …) stays COMPANY-WIDE, exactly as
-- today. A user is scoped only if ALL their roles are in the scoped set.
--
-- Owner decisions (locked): 1) Finance/Viewer/IT company-wide. 2) multi-role →
-- company-wide if ANY non-scoped role, else union of scoped. 3) reuse single
-- region/area manager_id. 4) supervisor = reports_to reps + branch customers.
-- 5) match customer's own region/area AND its branch's region/area. 6) READ scope
-- only (WITH CHECK stays company-only; write-scope = S4b). 7) customers + routes
-- only (transactional = S4b). 8) RLS enforcement.
--
-- erp_profiles.id = auth.users(id) (1:1) → region/area manager_id compares
-- directly to auth.uid(). No recursion (reports_to is one level). Resolvers are
-- STABLE SECURITY DEFINER. Held from production; rolled-back-live verified.
-- ============================================================================

-- The five scoped FMCG roles (everything else = company-wide).
-- Kept inline in each function for a single, self-contained migration.

-- ── Roles of the current user (across their branch assignments) ──────────────
CREATE OR REPLACE FUNCTION erp_user_roles()
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT role), ARRAY[]::text[])
  FROM erp_user_branches WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.erp_user_roles() FROM anon;

-- ── Company-wide? true unless the user holds ONLY scoped FMCG roles ───────────
CREATE OR REPLACE FUNCTION erp_user_is_company_wide()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE roles text[];
BEGIN
  IF erp_is_platform_owner() OR erp_is_super_admin() THEN RETURN true; END IF;
  roles := erp_user_roles();
  -- Any role outside the scoped set → company-wide (preserves non-sales roles).
  RETURN EXISTS (
    SELECT 1 FROM unnest(roles) r
    WHERE r NOT IN ('regional_manager', 'area_manager', 'branch_manager', 'supervisor', 'salesman')
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_user_is_company_wide() FROM anon;

-- ── Customer in the current user's scope? ────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_customer_in_scope(
  p_branch_id uuid, p_region_id uuid, p_area_id uuid, p_salesman_id uuid, p_route_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE roles text[];
BEGIN
  IF erp_user_is_company_wide() THEN RETURN true; END IF;
  roles := erp_user_roles();
  RETURN (
    -- Regional Manager → their regions (customer's own region OR its branch's region)
    ('regional_manager' = ANY(roles) AND EXISTS (
      SELECT 1 FROM erp_regions rg
      WHERE rg.manager_id = auth.uid()
        AND (rg.id = p_region_id
             OR rg.id = (SELECT b.region_id FROM erp_branches b WHERE b.id = p_branch_id))
    ))
    -- Area Manager → their areas (customer's own area OR its branch's area)
    OR ('area_manager' = ANY(roles) AND EXISTS (
      SELECT 1 FROM erp_areas ar
      WHERE ar.manager_id = auth.uid()
        AND (ar.id = p_area_id
             OR ar.id = (SELECT b.area_id FROM erp_branches b WHERE b.id = p_branch_id))
    ))
    -- Branch Manager → customers in their assigned branch(es)
    OR ('branch_manager' = ANY(roles) AND p_branch_id = ANY(erp_user_branch_ids()))
    -- Supervisor → their reps' customers (reports_to) + their branch customers
    OR ('supervisor' = ANY(roles) AND (
         p_branch_id = ANY(erp_user_branch_ids())
         OR EXISTS (SELECT 1 FROM erp_user_branches ub
                    WHERE ub.reports_to = auth.uid() AND ub.user_id = p_salesman_id)
    ))
    -- Sales Rep → their own customers + customers on their routes
    OR ('salesman' = ANY(roles) AND (
         p_salesman_id = auth.uid()
         OR EXISTS (SELECT 1 FROM erp_routes rt WHERE rt.id = p_route_id AND rt.rep_id = auth.uid())
    ))
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_customer_in_scope(uuid, uuid, uuid, uuid, uuid) FROM anon;

-- ── Route in scope? (routes have no geo/branch link in S4a) ───────────────────
-- Scoped only for supervisor + salesman; managers (regional/area/branch) without
-- a rep/supervisor role keep company-wide route visibility (no geo to scope by).
CREATE OR REPLACE FUNCTION erp_route_in_scope(p_rep_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE roles text[];
BEGIN
  IF erp_user_is_company_wide() THEN RETURN true; END IF;
  roles := erp_user_roles();
  IF (('regional_manager' = ANY(roles)) OR ('area_manager' = ANY(roles)) OR ('branch_manager' = ANY(roles)))
     AND NOT (('supervisor' = ANY(roles)) OR ('salesman' = ANY(roles))) THEN
    RETURN true;  -- pure manager: routes not geo-scopable in S4a → see all
  END IF;
  RETURN (
    ('salesman' = ANY(roles) AND p_rep_id = auth.uid())
    OR ('supervisor' = ANY(roles) AND (
         p_rep_id = auth.uid()
         OR EXISTS (SELECT 1 FROM erp_user_branches ub
                    WHERE ub.reports_to = auth.uid() AND ub.user_id = p_rep_id)
    ))
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_route_in_scope(uuid) FROM anon;

-- Supporting index for the supervisor (reports_to) lookup.
CREATE INDEX IF NOT EXISTS idx_erp_user_branches_reports_to ON erp_user_branches(reports_to);

-- ── RLS: replace company-only with scoped read; writes stay company-only ─────
-- erp_customers: USING = scoped read; WITH CHECK = company-only (S4a read-scope).
DROP POLICY IF EXISTS "erp_customers_tenant" ON erp_customers;
DROP POLICY IF EXISTS "erp_customers_scope" ON erp_customers;
CREATE POLICY "erp_customers_scope" ON erp_customers FOR ALL
  USING (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id()
        AND erp_customer_in_scope(branch_id, region_id, area_id, salesman_id, route_id))
  )
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- erp_routes: USING = scoped read; WITH CHECK = company-only.
DROP POLICY IF EXISTS "erp_routes_tenant" ON erp_routes;
DROP POLICY IF EXISTS "erp_routes_scope" ON erp_routes;
CREATE POLICY "erp_routes_scope" ON erp_routes FOR ALL
  USING (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id() AND erp_route_in_scope(rep_id))
  )
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "erp_customers_scope" ON erp_customers;
-- CREATE POLICY "erp_customers_tenant" ON erp_customers FOR ALL
--   USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
--   WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
-- DROP POLICY IF EXISTS "erp_routes_scope" ON erp_routes;
-- CREATE POLICY "erp_routes_tenant" ON erp_routes FOR ALL
--   USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
--   WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
-- DROP FUNCTION IF EXISTS erp_route_in_scope(uuid);
-- DROP FUNCTION IF EXISTS erp_customer_in_scope(uuid, uuid, uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS erp_user_is_company_wide();
-- DROP FUNCTION IF EXISTS erp_user_roles();
