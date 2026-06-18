-- 0340_p4_recursive_reports_scope.sql
-- Priority 4: hierarchical (recursive) reports_to visibility, future-compatible.
--
-- Uses the existing recursive helper erp_user_subtree(uid) (user + all descendants over
-- erp_user_branches.reports_to). ONE rule scopes every manager tier — Supervisor, Area
-- Manager, Regional Manager, Sales Director — by their reports SUBTREE (direct AND
-- indirect), so adding a tier needs only reports_to edges, no code. Sales Rep = own;
-- company-wide roles = all.
--
-- Fallback-safe (no cross-tenant regression): a Supervisor with NO reports configured
-- keeps the legacy branch-wide scope; only once a hierarchy is configured does the
-- Supervisor tighten to team. The erp_role_scope override path is preserved unchanged.

begin;

-- ── Configure the pilot reporting hierarchy (rep → supervisor) so the team exists.
update erp_user_branches sm
set reports_to = (
  select ub.user_id from erp_user_branches ub
  join erp_branches b on b.id = ub.branch_id
  where b.company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0' and ub.role = 'supervisor' limit 1)
from erp_branches b
where sm.branch_id = b.id
  and b.company_id = '612af0bd-973c-4fed-8e76-80cf444ef9e0'
  and sm.role in ('salesman','driver')
  and sm.reports_to is null;

-- ── erp_customer_in_scope: recursive subtree for all manager tiers (+ legacy fallbacks).
CREATE OR REPLACE FUNCTION public.erp_customer_in_scope(p_branch_id uuid, p_region_id uuid, p_area_id uuid, p_salesman_id uuid, p_route_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE roles text[];
BEGIN
  IF erp_user_is_company_wide() THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_role_scope WHERE user_id = auth.uid()) THEN
    roles := erp_user_roles();
    RETURN (
      -- P4: recursive reports-subtree — any manager sees direct AND indirect reports.
      (p_salesman_id IN (SELECT erp_user_subtree(auth.uid())))
      OR ('regional_manager' = ANY(roles) AND EXISTS (SELECT 1 FROM erp_regions rg WHERE rg.manager_id = auth.uid() AND (rg.id = p_region_id OR rg.id = (SELECT b.region_id FROM erp_branches b WHERE b.id = p_branch_id))))
      OR ('area_manager' = ANY(roles) AND EXISTS (SELECT 1 FROM erp_areas ar WHERE ar.manager_id = auth.uid() AND (ar.id = p_area_id OR ar.id = (SELECT b.area_id FROM erp_branches b WHERE b.id = p_branch_id))))
      OR ('branch_manager' = ANY(roles) AND p_branch_id = ANY(erp_user_branch_ids()))
      -- Supervisor branch-wide ONLY as fallback when no reports are configured.
      OR ('supervisor' = ANY(roles) AND NOT EXISTS (SELECT 1 FROM erp_user_branches WHERE reports_to = auth.uid()) AND p_branch_id = ANY(erp_user_branch_ids()))
      OR ('salesman' = ANY(roles) AND (p_salesman_id = auth.uid() OR EXISTS (SELECT 1 FROM erp_routes rt WHERE rt.id = p_route_id AND rt.rep_id = auth.uid())))
    );
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM erp_role_scope s WHERE s.user_id = auth.uid() AND s.company_id = erp_user_company_id() AND (
      s.dimension = 'company'
      OR (s.dimension = 'branch' AND (p_branch_id = ANY(erp_user_branch_ids()) OR (p_branch_id IS NOT NULL AND s.scope_set ? p_branch_id::text)))
      OR (s.dimension = 'region' AND (EXISTS (SELECT 1 FROM erp_regions rg WHERE rg.manager_id = auth.uid() AND (rg.id = p_region_id OR rg.id = (SELECT b.region_id FROM erp_branches b WHERE b.id = p_branch_id))) OR (p_region_id IS NOT NULL AND s.scope_set ? p_region_id::text) OR s.scope_set ? (SELECT b.region_id::text FROM erp_branches b WHERE b.id = p_branch_id)))
      OR (s.dimension = 'area' AND (EXISTS (SELECT 1 FROM erp_areas ar WHERE ar.manager_id = auth.uid() AND (ar.id = p_area_id OR ar.id = (SELECT b.area_id FROM erp_branches b WHERE b.id = p_branch_id))) OR (p_area_id IS NOT NULL AND s.scope_set ? p_area_id::text) OR s.scope_set ? (SELECT b.area_id::text FROM erp_branches b WHERE b.id = p_branch_id)))
      OR (s.dimension = 'own_customers' AND (p_salesman_id = auth.uid() OR EXISTS (SELECT 1 FROM erp_routes rt WHERE rt.id = p_route_id AND rt.rep_id = auth.uid())))
      OR (s.dimension = 'own_team' AND (p_salesman_id IN (SELECT erp_user_subtree(auth.uid())) OR EXISTS (SELECT 1 FROM erp_routes rt WHERE rt.id = p_route_id AND rt.rep_id IN (SELECT erp_user_subtree(auth.uid())))))
    )
  );
END $function$;

-- ── erp_route_in_scope: recursive subtree for supervisor+managers (+ legacy fallbacks).
CREATE OR REPLACE FUNCTION public.erp_route_in_scope(p_rep_id uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE roles text[];
BEGIN
  IF erp_user_is_company_wide() THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_role_scope WHERE user_id = auth.uid()) THEN
    roles := erp_user_roles();
    IF (('regional_manager' = ANY(roles)) OR ('area_manager' = ANY(roles)) OR ('branch_manager' = ANY(roles))) AND NOT (('supervisor' = ANY(roles)) OR ('salesman' = ANY(roles))) THEN RETURN true; END IF;
    RETURN (
      ('salesman' = ANY(roles) AND p_rep_id = auth.uid())
      OR (p_rep_id IN (SELECT erp_user_subtree(auth.uid())))
    );
  END IF;
  RETURN EXISTS (SELECT 1 FROM erp_role_scope s WHERE s.user_id = auth.uid() AND s.company_id = erp_user_company_id() AND (s.dimension IN ('company', 'branch', 'region', 'area') OR (s.dimension = 'own_customers' AND p_rep_id = auth.uid()) OR (s.dimension = 'own_team' AND p_rep_id IN (SELECT erp_user_subtree(auth.uid())))));
END $function$;

-- ── P2/P3 request policies: approver now sees their reports SUBTREE (team), fallback branch.
alter policy erp_customer_requests_read on erp_customer_requests using (
  erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
    erp_user_is_company_wide()
    OR salesman_id = auth.uid()
    OR (erp_user_has_perm('customer.request.approve') AND (
         salesman_id IN (SELECT erp_user_subtree(auth.uid()))
         OR (NOT EXISTS (SELECT 1 FROM erp_user_branches WHERE reports_to = auth.uid())
             AND EXISTS (SELECT 1 FROM erp_user_branches ub WHERE ub.user_id = salesman_id AND ub.branch_id = any (erp_user_branch_ids()))))))));
alter policy erp_customer_requests_write on erp_customer_requests
  using (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide() OR salesman_id = auth.uid()
      OR (erp_user_has_perm('customer.request.approve') AND (
           salesman_id IN (SELECT erp_user_subtree(auth.uid()))
           OR (NOT EXISTS (SELECT 1 FROM erp_user_branches WHERE reports_to = auth.uid())
               AND EXISTS (SELECT 1 FROM erp_user_branches ub WHERE ub.user_id = salesman_id AND ub.branch_id = any (erp_user_branch_ids()))))))))
  with check (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide() OR salesman_id = auth.uid()
      OR (erp_user_has_perm('customer.request.approve') AND (
           salesman_id IN (SELECT erp_user_subtree(auth.uid()))
           OR (NOT EXISTS (SELECT 1 FROM erp_user_branches WHERE reports_to = auth.uid())
               AND EXISTS (SELECT 1 FROM erp_user_branches ub WHERE ub.user_id = salesman_id AND ub.branch_id = any (erp_user_branch_ids()))))))));

alter policy erp_cash_handover_read on erp_cash_handover_requests using (
  erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
    erp_user_is_company_wide() OR salesman_id = auth.uid()
    OR (erp_user_has_perm('cash.handover.confirm') AND (
         salesman_id IN (SELECT erp_user_subtree(auth.uid()))
         OR (NOT EXISTS (SELECT 1 FROM erp_user_branches WHERE reports_to = auth.uid())
             AND EXISTS (SELECT 1 FROM erp_user_branches ub WHERE ub.user_id = salesman_id AND ub.branch_id = any (erp_user_branch_ids()))))))));
alter policy erp_cash_handover_write on erp_cash_handover_requests
  using (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide() OR salesman_id = auth.uid()
      OR (erp_user_has_perm('cash.handover.confirm') AND (
           salesman_id IN (SELECT erp_user_subtree(auth.uid()))
           OR (NOT EXISTS (SELECT 1 FROM erp_user_branches WHERE reports_to = auth.uid())
               AND EXISTS (SELECT 1 FROM erp_user_branches ub WHERE ub.user_id = salesman_id AND ub.branch_id = any (erp_user_branch_ids()))))))))
  with check (
    erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (
      erp_user_is_company_wide() OR salesman_id = auth.uid()
      OR (erp_user_has_perm('cash.handover.confirm') AND (
           salesman_id IN (SELECT erp_user_subtree(auth.uid()))
           OR (NOT EXISTS (SELECT 1 FROM erp_user_branches WHERE reports_to = auth.uid())
               AND EXISTS (SELECT 1 FROM erp_user_branches ub WHERE ub.user_id = salesman_id AND ub.branch_id = any (erp_user_branch_ids()))))))));

commit;
