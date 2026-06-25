-- ============================================================================
-- 0387: Route Planner — permission-gated company-wide READ for mission tracking/reports
-- (ADDITIVE policy only).
--
-- The mission RLS (0363) scopes reads to admin / creator / assignee / reporting-graph. That
-- is correct for reps (a salesman sees only their own missions), but a Supervisor or Viewer
-- whose job is OVERSIGHT then sees an empty tracking board unless the reporting graph is
-- configured. Field Verification solved the same need with a permission-gated company-wide
-- read (erp_fv_can_view_all_reports, 0373/0374). We mirror that here.
--
-- This adds a NEW permissive SELECT policy on each mission table, granting company-scoped read
-- to holders of route_planner.export (admin / manager / area_manager / supervisor / viewer —
-- NOT salesman / driver, who lack export, so rep isolation is unchanged). Postgres OR-combines
-- permissive policies, so this only ADDS a read path; it never removes one. Company isolation
-- is preserved (company_id = erp_user_company_id()); no write path; no Field Verification
-- impact. CREATE POLICY IF NOT EXISTS is not supported, so each is guarded with a DO block.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='erp_rp_missions' AND policyname='rp_mis_sel_reports') THEN
    CREATE POLICY rp_mis_sel_reports ON erp_rp_missions FOR SELECT
      USING (company_id = erp_user_company_id() AND erp_user_has_permission(company_id, 'route_planner.export'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='erp_rp_mission_stops' AND policyname='rp_stop_sel_reports') THEN
    CREATE POLICY rp_stop_sel_reports ON erp_rp_mission_stops FOR SELECT
      USING (company_id = erp_user_company_id() AND erp_user_has_permission(company_id, 'route_planner.export'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='erp_rp_mission_events' AND policyname='rp_event_sel_reports') THEN
    CREATE POLICY rp_event_sel_reports ON erp_rp_mission_events FOR SELECT
      USING (company_id = erp_user_company_id() AND erp_user_has_permission(company_id, 'route_planner.export'));
  END IF;
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS rp_mis_sel_reports ON erp_rp_missions;
-- DROP POLICY IF EXISTS rp_stop_sel_reports ON erp_rp_mission_stops;
-- DROP POLICY IF EXISTS rp_event_sel_reports ON erp_rp_mission_events;
