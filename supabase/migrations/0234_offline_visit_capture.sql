-- ============================================================================
-- 0234: Offline visit capture — verdict columns + capture-time-accurate check-in
-- ----------------------------------------------------------------------------
-- Step 1 (Mobile Field Client). Two additive changes, INERT until KAKO_MOBILE:
--
--  1. erp_offline_mutations gains `verdict` + `result` so the intake can record
--     the SERVER's rich validation outcome (valid / out_of_route / gps_violation
--     / blocked / accepted / rejected / duplicate / exception) alongside the
--     coarse status — the device shows "Pending Validation" until this lands.
--
--  2. erp_check_in_visit gains two OPTIONAL trailing params (p_check_in_at,
--     p_visit_date). Online callers pass neither → COALESCE falls back to now()/
--     CURRENT_DATE, so the live path is byte-for-byte unchanged. The offline
--     intake replays the SAME compliance RPC with the captured timestamp/date so
--     a visit synced later lands on the day it actually happened — preserving KPI
--     and compliance integrity. Single source of truth (no forked logic).
--
-- Additive + idempotent. Depends on 0131 (RPC), 0230 (offline tables).
-- ============================================================================

-- 1 ── richer verdict capture on the offline mutation log ─────────────────────
ALTER TABLE erp_offline_mutations ADD COLUMN IF NOT EXISTS verdict text;
ALTER TABLE erp_offline_mutations ADD COLUMN IF NOT EXISTS result  jsonb;

-- 2 ── capture-time-accurate check-in (drop old arity, recreate with defaults) ─
DROP FUNCTION IF EXISTS erp_check_in_visit(uuid, numeric, numeric, uuid, text, boolean);

CREATE OR REPLACE FUNCTION erp_check_in_visit(
  p_customer_id uuid, p_lat numeric, p_lng numeric, p_work_session_id uuid,
  p_reason text DEFAULT NULL, p_force boolean DEFAULT false,
  p_check_in_at timestamptz DEFAULT NULL, p_visit_date date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  c            RECORD;
  v_in_plan    boolean;
  v_assigned   boolean;
  v_radius     integer;
  v_distance   integer;
  v_gps_status text;
  v_out_of_route boolean;
  v_violation  boolean;
  v_visit_id   uuid;
  v_comp_id    uuid;
  v_kind       text;
  v_status     text;
  v_notify     text;
  v_require    boolean;
  v_blocked    boolean := false;
  s            erp_fmcg_settings;
  -- Captured time/day (offline) or live now()/CURRENT_DATE (online). Single path.
  v_at         timestamptz := COALESCE(p_check_in_at, now());
  v_day        date        := COALESCE(p_visit_date, COALESCE(p_check_in_at, now())::date);
BEGIN
  SELECT * INTO c FROM erp_customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF NOT erp_is_platform_owner() AND c.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant check-in denied' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO s FROM erp_fmcg_settings WHERE company_id = c.company_id;

  v_in_plan  := erp_customer_in_today_plan(v_uid, p_customer_id, v_day);
  v_assigned := (c.salesman_id = v_uid);
  v_radius   := erp_customer_gps_radius(p_customer_id);
  v_distance := erp_gps_distance_m(p_lat, p_lng, c.latitude, c.longitude);

  IF c.latitude IS NULL OR c.longitude IS NULL THEN
    v_gps_status := 'no_customer_gps';
  ELSIF p_lat IS NULL OR p_lng IS NULL THEN
    v_gps_status := 'no_device_gps';
  ELSIF v_distance <= v_radius THEN
    v_gps_status := 'ok';
  ELSE
    v_gps_status := 'violation';
  END IF;

  v_out_of_route := (NOT v_assigned) OR (NOT v_in_plan);
  v_violation    := (v_gps_status = 'violation');

  -- Upsert the visit row for (salesman, customer, captured day, session).
  SELECT id INTO v_visit_id FROM erp_visits
   WHERE customer_id = p_customer_id AND salesman_id = v_uid
     AND visit_date = v_day
     AND work_session_id IS NOT DISTINCT FROM p_work_session_id
   LIMIT 1;

  IF v_visit_id IS NULL THEN
    INSERT INTO erp_visits (
      branch_id, customer_id, salesman_id, visit_date, work_session_id, route_id,
      check_in_at, check_in_lat, check_in_lng, gps_distance_m, gps_status,
      out_of_route, in_journey_plan)
    VALUES (
      c.branch_id, p_customer_id, v_uid, v_day, p_work_session_id, c.route_id,
      v_at, p_lat, p_lng, v_distance, v_gps_status,
      v_out_of_route, v_in_plan)
    RETURNING id INTO v_visit_id;
  ELSE
    UPDATE erp_visits SET
      work_session_id = COALESCE(p_work_session_id, work_session_id),
      route_id        = COALESCE(c.route_id, route_id),
      check_in_at     = v_at,
      check_in_lat    = p_lat,
      check_in_lng    = p_lng,
      gps_distance_m  = v_distance,
      gps_status      = v_gps_status,
      out_of_route    = v_out_of_route,
      in_journey_plan = v_in_plan
    WHERE id = v_visit_id;
  END IF;

  -- Log a compliance exception when geofence-violated or out-of-route.
  IF v_violation OR v_out_of_route THEN
    v_kind   := CASE WHEN v_violation THEN 'gps_violation' ELSE 'out_of_route' END;
    v_require := CASE WHEN v_violation
                   THEN COALESCE(s.gps_require_approval, false)
                   ELSE COALESCE(s.out_of_route_require_approval, false) END;
    v_notify  := CASE WHEN v_violation
                   THEN COALESCE(s.gps_notify, 'supervisor')
                   ELSE COALESCE(s.out_of_route_notify, 'supervisor') END;

    IF v_require AND NOT (p_force AND erp_user_has_perm('visit.override_gps')) THEN
      v_status := 'pending_approval';
    ELSE
      v_status := 'logged';
    END IF;

    INSERT INTO erp_visit_compliance (
      company_id, visit_id, kind, distance_m, device_lat, device_lng,
      customer_lat, customer_lng, reason, status, notified_role)
    VALUES (
      c.company_id, v_visit_id, v_kind, v_distance, p_lat, p_lng,
      c.latitude, c.longitude, p_reason, v_status, v_notify)
    RETURNING id INTO v_comp_id;

    v_blocked := (v_status = 'pending_approval' AND NOT p_force);
  END IF;

  PERFORM erp_log_audit('check_in', 'visit', v_visit_id::text,
    jsonb_build_object('customer_id', p_customer_id, 'gps_status', v_gps_status,
      'distance_m', v_distance, 'radius_m', v_radius, 'out_of_route', v_out_of_route,
      'in_plan', v_in_plan, 'assigned', v_assigned, 'compliance_id', v_comp_id,
      'blocked', v_blocked, 'check_in_at', v_at, 'offline', p_check_in_at IS NOT NULL),
    c.company_id);

  RETURN jsonb_build_object(
    'visit_id', v_visit_id,
    'gps_status', v_gps_status,
    'distance_m', v_distance,
    'radius_m', v_radius,
    'in_plan', v_in_plan,
    'assigned', v_assigned,
    'out_of_route', v_out_of_route,
    'violation', v_violation,
    'blocked', v_blocked,
    'compliance_id', v_comp_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_check_in_visit(uuid, numeric, numeric, uuid, text, boolean, timestamptz, date) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.erp_check_in_visit(uuid, numeric, numeric, uuid, text, boolean, timestamptz, date) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- ALTER TABLE erp_offline_mutations DROP COLUMN IF EXISTS verdict;
-- ALTER TABLE erp_offline_mutations DROP COLUMN IF EXISTS result;
-- DROP FUNCTION IF EXISTS erp_check_in_visit(uuid, numeric, numeric, uuid, text, boolean, timestamptz, date);
-- (then re-create the 6-arg form from 0131)
