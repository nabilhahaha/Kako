-- ============================================================================
-- 0131: FMCG Operations — GPS check-in compliance (geofence + out-of-route)
-- ----------------------------------------------------------------------------
-- The rep app calls erp_check_in_visit() when arriving at a customer. We compute
-- the geofence distance (haversine) against the customer pin, whether the
-- customer is on today's journey plan and assigned to the caller, and log a
-- compliance exception when the visit is a GPS violation or out-of-route. The
-- exception may require approval (per erp_fmcg_settings); a supervisor/manager
-- resolves it with erp_decide_visit_compliance().
--
-- Additive. Visits are branch-scoped (erp_visits.branch_id); the compliance log
-- is company-scoped (RLS) like the other FMCG ops tables. Write RPCs self-guard
-- on tenant scope + granular permission via erp_user_has_perm() (from 0130).
-- ============================================================================

-- ── Haversine distance in metres (pure math, IMMUTABLE; no SECDEF needed) ──────
CREATE OR REPLACE FUNCTION erp_gps_distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE round(
      2 * 6371000 * asin(
        sqrt(
          power(sin(radians((lat2 - lat1) / 2)), 2) +
          cos(radians(lat1)) * cos(radians(lat2)) *
          power(sin(radians((lng2 - lng1) / 2)), 2)
        )
      )
    )::integer
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.erp_gps_distance_m(numeric, numeric, numeric, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_gps_distance_m(numeric, numeric, numeric, numeric) TO authenticated, service_role;

-- ── Visit compliance log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_visit_compliance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  visit_id     UUID REFERENCES erp_visits(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('gps_violation','out_of_route','wrong_day','out_of_sequence')),
  distance_m   INTEGER,
  device_lat   NUMERIC(9,6),
  device_lng   NUMERIC(9,6),
  customer_lat NUMERIC(9,6),
  customer_lng NUMERIC(9,6),
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'logged' CHECK (status IN ('logged','pending_approval','approved','rejected')),
  notified_role TEXT,
  decided_by   UUID,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_visit_compliance_company_status ON erp_visit_compliance(company_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_visit_compliance_visit ON erp_visit_compliance(visit_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_visit_compliance ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_visit_compliance_set_company ON erp_visit_compliance';
  EXECUTE 'CREATE TRIGGER erp_visit_compliance_set_company BEFORE INSERT ON erp_visit_compliance FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_visit_compliance_read ON erp_visit_compliance';
  EXECUTE 'CREATE POLICY erp_visit_compliance_read ON erp_visit_compliance FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_visit_compliance_write ON erp_visit_compliance';
  EXECUTE 'CREATE POLICY erp_visit_compliance_write ON erp_visit_compliance FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── Check in to a customer visit with GPS + route compliance ───────────────────
-- caller (auth.uid()) is the salesman. Resolves the customer, computes geofence
-- distance + plan/assignment status, upserts today's visit row with GPS columns,
-- and logs an exception when out of geofence or out of route. If config requires
-- approval (and the caller is not force-overriding with visit.override_gps) the
-- exception is pending_approval and the visit is "blocked" until approved.
CREATE OR REPLACE FUNCTION erp_check_in_visit(
  p_customer_id uuid, p_lat numeric, p_lng numeric, p_work_session_id uuid,
  p_reason text DEFAULT NULL, p_force boolean DEFAULT false
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
BEGIN
  SELECT * INTO c FROM erp_customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF NOT erp_is_platform_owner() AND c.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant check-in denied' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO s FROM erp_fmcg_settings WHERE company_id = c.company_id;

  v_in_plan  := erp_customer_in_today_plan(v_uid, p_customer_id, CURRENT_DATE);
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

  -- Upsert today's visit row for (salesman, customer, today, session).
  SELECT id INTO v_visit_id FROM erp_visits
   WHERE customer_id = p_customer_id AND salesman_id = v_uid
     AND visit_date = CURRENT_DATE
     AND work_session_id IS NOT DISTINCT FROM p_work_session_id
   LIMIT 1;

  IF v_visit_id IS NULL THEN
    INSERT INTO erp_visits (
      branch_id, customer_id, salesman_id, visit_date, work_session_id, route_id,
      check_in_at, check_in_lat, check_in_lng, gps_distance_m, gps_status,
      out_of_route, in_journey_plan)
    VALUES (
      c.branch_id, p_customer_id, v_uid, CURRENT_DATE, p_work_session_id, c.route_id,
      now(), p_lat, p_lng, v_distance, v_gps_status,
      v_out_of_route, v_in_plan)
    RETURNING id INTO v_visit_id;
  ELSE
    UPDATE erp_visits SET
      work_session_id = COALESCE(p_work_session_id, work_session_id),
      route_id        = COALESCE(c.route_id, route_id),
      check_in_at     = now(),
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
      'blocked', v_blocked), c.company_id);

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
REVOKE EXECUTE ON FUNCTION public.erp_check_in_visit(uuid, numeric, numeric, uuid, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_check_in_visit(uuid, numeric, numeric, uuid, text, boolean) TO authenticated, service_role;

-- ── Approve / reject a pending visit-compliance exception ──────────────────────
CREATE OR REPLACE FUNCTION erp_decide_visit_compliance(
  p_id uuid, p_approve boolean, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_c erp_visit_compliance; v_status text;
BEGIN
  IF NOT (erp_user_has_perm('visit.approve_out_of_route') OR erp_user_has_perm('visit.override_gps')) THEN
    RAISE EXCEPTION 'not authorized: visit.approve_out_of_route' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_c FROM erp_visit_compliance WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'compliance record not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_c.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;

  v_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  UPDATE erp_visit_compliance
     SET status = v_status, decided_by = auth.uid(), decided_at = now(),
         reason = COALESCE(p_note, reason)
   WHERE id = p_id;

  PERFORM erp_log_audit('decide_compliance', 'visit_compliance', p_id::text,
    jsonb_build_object('approve', p_approve, 'note', p_note, 'kind', v_c.kind), v_c.company_id);
  RETURN jsonb_build_object('compliance_id', p_id, 'status', v_status);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_decide_visit_compliance(uuid, boolean, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_decide_visit_compliance(uuid, boolean, text) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_decide_visit_compliance(uuid, boolean, text);
-- DROP FUNCTION IF EXISTS erp_check_in_visit(uuid, numeric, numeric, uuid, text, boolean);
-- DROP TABLE IF EXISTS erp_visit_compliance;
-- DROP FUNCTION IF EXISTS erp_gps_distance_m(numeric, numeric, numeric, numeric);
