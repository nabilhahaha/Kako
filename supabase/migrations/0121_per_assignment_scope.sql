-- ============================================================================
-- 0121: Authorization Phase 3 (P3) — Per-Assignment Scope + RLS Predicate Swap
--                                    + Transitive own_team
-- ----------------------------------------------------------------------------
-- Moves visibility scope from "INFERRED from role" (0104/0105) to "DECLARED per
-- assignment" (erp_role_scope), while staying 100% CUTOVER-SAFE.
--
-- PRIME DIRECTIVE — ZERO-ROWS = BYTE-IDENTICAL:
--   With ZERO erp_role_scope rows for a user, the revised resolvers reproduce the
--   EXACT 0104/0105 predicates, unchanged. Concretely, every resolver opens with:
--
--       IF NOT EXISTS (SELECT 1 FROM erp_role_scope
--                      WHERE user_id = auth.uid()) THEN
--         <verbatim 0104/0105 predicate>
--       END IF;
--
--   so a tenant that adds NO scope rows behaves exactly like today — including the
--   supervisor staying ONE-LEVEL (reports_to = auth.uid()), salesman = own
--   customers/routes, managers = region/area/branch membership, everyone else
--   company-wide. Nothing visible changes at cutover.
--
-- OPT-IN NEW MODEL — only when the user HAS erp_role_scope rows:
--   Each row is an ASSIGNMENT carrying a ScopeRef: a `dimension` plus an explicit
--   `scope_set` (jsonb array of ids). The resolver then evaluates the union of the
--   user's assignments:
--     company       → all (company-guarded, never cross-tenant)
--     branch        → branch membership OR customer.branch ∈ scope_set
--     region        → region membership OR customer's region/branch-region ∈ scope_set
--     area          → area membership OR customer's area/branch-area ∈ scope_set
--     own_customers → salesman_id = self (or route.rep = self)
--     own_team      → salesman_id ∈ erp_user_subtree(self)  [TRANSITIVE, opt-in]
--
-- TRANSITIVE own_team IS OPT-IN: the recursive multi-level subtree closure
-- (erp_user_subtree) is reached ONLY via an explicit `own_team` assignment row.
-- A supervisor with no erp_role_scope rows still sees exactly one level
-- (the 0104 reports_to = auth.uid() fallback). Multi-level visibility never
-- appears unless an admin declares an `own_team` assignment for that user.
--
-- SCOPE: read-scope only (USING). WITH CHECK is unchanged from 0105. Policies are
-- NOT modified — they keep calling the same function signatures. All resolvers
-- keep STABLE SECURITY DEFINER + pinned search_path + the anon/public revoke
-- posture from 0104/0105. Forward-only, idempotent.
-- ============================================================================

-- ── 1. erp_role_scope — declared per-assignment ScopeRef store ────────────────
CREATE TABLE IF NOT EXISTS erp_role_scope (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key    TEXT NOT NULL,
  dimension   TEXT NOT NULL CHECK (dimension IN (
                'company', 'branch', 'region', 'area', 'own_customers', 'own_team'
              )),
  scope_set   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_erp_role_scope_user ON erp_role_scope(user_id);
CREATE INDEX IF NOT EXISTS idx_erp_role_scope_company ON erp_role_scope(company_id);

-- RLS + company_id trigger + updated_at (same pattern as erp_customer_lookups /
-- erp_regions). Read = any company member; write = company admin / platform owner.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_role_scope ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_role_scope_set_company ON erp_role_scope';
  EXECUTE 'CREATE TRIGGER erp_role_scope_set_company BEFORE INSERT ON erp_role_scope FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_role_scope_updated ON erp_role_scope';
  EXECUTE 'CREATE TRIGGER erp_role_scope_updated BEFORE UPDATE ON erp_role_scope FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';

  -- Read: any member of the company (so resolvers / UI can inspect assignments).
  EXECUTE 'DROP POLICY IF EXISTS "erp_role_scope_read" ON erp_role_scope';
  EXECUTE 'CREATE POLICY "erp_role_scope_read" ON erp_role_scope FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';

  -- Write: company admin (holds the admin role) or platform owner only.
  EXECUTE 'DROP POLICY IF EXISTS "erp_role_scope_write" ON erp_role_scope';
  EXECUTE $p$
    CREATE POLICY "erp_role_scope_write" ON erp_role_scope FOR ALL
      USING (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND 'admin' = ANY(erp_user_roles()))
      )
      WITH CHECK (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND 'admin' = ANY(erp_user_roles()))
      )
  $p$;
END $$;

-- ── 2. erp_user_subtree — TRANSITIVE downline closure (recursive) ─────────────
-- Returns p_uid plus all transitive reports via erp_user_branches.reports_to.
-- Reached only through an explicit `own_team` assignment (see resolver below), so
-- it is opt-in and never affects the zero-rows fallback. Posture matches 0120's
-- helpers: STABLE SECURITY DEFINER, pinned search_path, anon/public revoked,
-- authenticated/service_role granted.
CREATE OR REPLACE FUNCTION erp_user_subtree(p_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE sub AS (
    SELECT p_uid AS user_id
    UNION
    SELECT ub.user_id
    FROM erp_user_branches ub
    JOIN sub ON ub.reports_to = sub.user_id
    WHERE ub.user_id IS NOT NULL
  )
  SELECT DISTINCT user_id FROM sub;
$$;
REVOKE EXECUTE ON FUNCTION public.erp_user_subtree(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_user_subtree(uuid) TO authenticated, service_role;

-- ── 3. Scope-aware resolvers — cutover-safe fallback ──────────────────────────
-- Each keeps its EXACT 0104/0105 signature so the existing policies keep working.

-- erp_customer_in_scope: zero rows → verbatim 0104 predicate; else evaluate the
-- union of the user's declared ScopeRef assignments.
CREATE OR REPLACE FUNCTION erp_customer_in_scope(
  p_branch_id uuid, p_region_id uuid, p_area_id uuid, p_salesman_id uuid, p_route_id uuid
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE roles text[];
BEGIN
  IF erp_user_is_company_wide() THEN RETURN true; END IF;

  -- ── CUTOVER-SAFE FALLBACK: zero erp_role_scope rows ⇒ verbatim 0104 logic ──
  IF NOT EXISTS (SELECT 1 FROM erp_role_scope WHERE user_id = auth.uid()) THEN
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
      -- Supervisor → their reps' customers (reports_to, ONE level) + their branch customers
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
  END IF;

  -- ── PER-ASSIGNMENT MODEL: union of declared ScopeRef rows (opt-in) ─────────
  RETURN EXISTS (
    SELECT 1 FROM erp_role_scope s
    WHERE s.user_id = auth.uid()
      AND s.company_id = erp_user_company_id()           -- never cross-tenant
      AND (
        -- company → all in-tenant
        s.dimension = 'company'

        -- branch → membership OR explicit branch ids in scope_set
        OR (s.dimension = 'branch' AND (
              p_branch_id = ANY(erp_user_branch_ids())
              OR (p_branch_id IS NOT NULL
                  AND s.scope_set ? p_branch_id::text)
        ))

        -- region → manager membership OR explicit region ids (own region OR branch's region)
        OR (s.dimension = 'region' AND (
              EXISTS (SELECT 1 FROM erp_regions rg
                      WHERE rg.manager_id = auth.uid()
                        AND (rg.id = p_region_id
                             OR rg.id = (SELECT b.region_id FROM erp_branches b WHERE b.id = p_branch_id)))
              OR (p_region_id IS NOT NULL AND s.scope_set ? p_region_id::text)
              OR s.scope_set ? (SELECT b.region_id::text FROM erp_branches b WHERE b.id = p_branch_id)
        ))

        -- area → manager membership OR explicit area ids (own area OR branch's area)
        OR (s.dimension = 'area' AND (
              EXISTS (SELECT 1 FROM erp_areas ar
                      WHERE ar.manager_id = auth.uid()
                        AND (ar.id = p_area_id
                             OR ar.id = (SELECT b.area_id FROM erp_branches b WHERE b.id = p_branch_id)))
              OR (p_area_id IS NOT NULL AND s.scope_set ? p_area_id::text)
              OR s.scope_set ? (SELECT b.area_id::text FROM erp_branches b WHERE b.id = p_branch_id)
        ))

        -- own_customers → the customer is the user's own (self salesman / route rep)
        OR (s.dimension = 'own_customers' AND (
              p_salesman_id = auth.uid()
              OR EXISTS (SELECT 1 FROM erp_routes rt WHERE rt.id = p_route_id AND rt.rep_id = auth.uid())
        ))

        -- own_team → TRANSITIVE downline: customer's salesman ∈ subtree(self)
        OR (s.dimension = 'own_team' AND (
              p_salesman_id IN (SELECT erp_user_subtree(auth.uid()))
              OR EXISTS (SELECT 1 FROM erp_routes rt
                         WHERE rt.id = p_route_id
                           AND rt.rep_id IN (SELECT erp_user_subtree(auth.uid())))
        ))
      )
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_customer_in_scope(uuid, uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_customer_in_scope(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- erp_route_in_scope: zero rows → verbatim 0104 predicate; else evaluate ScopeRef.
CREATE OR REPLACE FUNCTION erp_route_in_scope(p_rep_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE roles text[];
BEGIN
  IF erp_user_is_company_wide() THEN RETURN true; END IF;

  -- ── CUTOVER-SAFE FALLBACK: zero erp_role_scope rows ⇒ verbatim 0104 logic ──
  IF NOT EXISTS (SELECT 1 FROM erp_role_scope WHERE user_id = auth.uid()) THEN
    roles := erp_user_roles();
    IF (('regional_manager' = ANY(roles)) OR ('area_manager' = ANY(roles)) OR ('branch_manager' = ANY(roles)))
       AND NOT (('supervisor' = ANY(roles)) OR ('salesman' = ANY(roles))) THEN
      RETURN true;  -- pure manager: routes not geo-scopable → see all
    END IF;
    RETURN (
      ('salesman' = ANY(roles) AND p_rep_id = auth.uid())
      OR ('supervisor' = ANY(roles) AND (
           p_rep_id = auth.uid()
           OR EXISTS (SELECT 1 FROM erp_user_branches ub
                      WHERE ub.reports_to = auth.uid() AND ub.user_id = p_rep_id)
      ))
    );
  END IF;

  -- ── PER-ASSIGNMENT MODEL: union of declared ScopeRef rows (opt-in) ─────────
  RETURN EXISTS (
    SELECT 1 FROM erp_role_scope s
    WHERE s.user_id = auth.uid()
      AND s.company_id = erp_user_company_id()
      AND (
        -- routes have no geo/branch link → geo dimensions see all routes (as today
        -- a pure manager does); own_customers / own_team narrow to self / subtree.
        s.dimension IN ('company', 'branch', 'region', 'area')
        OR (s.dimension = 'own_customers' AND p_rep_id = auth.uid())
        OR (s.dimension = 'own_team' AND p_rep_id IN (SELECT erp_user_subtree(auth.uid())))
      )
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_route_in_scope(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_route_in_scope(uuid) TO authenticated, service_role;

-- erp_customer_id_in_scope: unchanged shape — resolves the customer row then
-- delegates to erp_customer_in_scope (which now carries the fallback + new model).
-- Re-stated here verbatim from 0105 to keep a self-contained, idempotent migration.
CREATE OR REPLACE FUNCTION erp_customer_id_in_scope(p_customer_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE c RECORD;
BEGIN
  SELECT branch_id, region_id, area_id, salesman_id, route_id, company_id
    INTO c FROM erp_customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Defense in depth: never cross tenants.
  IF NOT erp_is_platform_owner() AND c.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RETURN false;
  END IF;
  RETURN erp_customer_in_scope(c.branch_id, c.region_id, c.area_id, c.salesman_id, c.route_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_customer_id_in_scope(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.erp_customer_id_in_scope(uuid) TO authenticated, service_role;

-- NOTE: erp_user_is_company_wide(), erp_invoice_id_in_scope(),
-- erp_invoice_branch_visible() are intentionally NOT redefined — their 0104/0105
-- behavior is correct under both paths (company-wide users bypass scope; scoped
-- users route through erp_customer_id_in_scope, which now carries the fallback).
-- Policies on erp_customers/erp_routes/erp_invoices/erp_sales_orders/
-- erp_sales_returns/erp_visits/erp_payments are UNCHANGED (they call the same
-- function signatures).

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- Restore the 0104/0105 bodies of erp_customer_in_scope / erp_route_in_scope /
-- erp_customer_id_in_scope (no erp_role_scope branch), then:
--   DROP FUNCTION IF EXISTS erp_user_subtree(uuid);
--   DROP TABLE IF EXISTS erp_role_scope;
