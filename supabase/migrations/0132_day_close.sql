-- ============================================================================
-- 0132: FMCG Operations — Day close (coverage, skips, approval-aware)
-- ----------------------------------------------------------------------------
-- Closing the day reconciles the salesman's planned journey against what was
-- actually visited: coverage %, orders vs no-order, skipped customers (with
-- reasons), and GPS / out-of-route counts. If coverage falls below the company
-- threshold, the close becomes pending_approval and a supervisor approves it.
--
-- Additive. erp_work_sessions stays branch-scoped; we keep its existing status /
-- closed_at columns and add reconciliation counters + a parallel close_status.
-- Write RPCs self-guard on tenant scope (via the session's branch->company) +
-- granular permission via erp_user_has_perm() (from 0130).
-- ============================================================================

-- ── Extend work sessions with reconciliation counters + approval state ─────────
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS planned_count INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS visited_count INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS skipped_count INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS orders_count INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS no_order_count INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS gps_violation_count INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS out_of_route_count INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS coverage_pct INTEGER;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS close_status TEXT
  NOT NULL DEFAULT 'open' CHECK (close_status IN ('open','pending_approval','closed'));
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS close_reason TEXT;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS closed_by UUID;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ── Per-customer skip log (reasons captured at day-close) ──────────────────────
CREATE TABLE IF NOT EXISTS erp_day_close_skips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  work_session_id UUID NOT NULL REFERENCES erp_work_sessions(id) ON DELETE CASCADE,
  customer_id     UUID,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_day_close_skips_session ON erp_day_close_skips(work_session_id);
CREATE INDEX IF NOT EXISTS idx_erp_day_close_skips_company ON erp_day_close_skips(company_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_day_close_skips ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_day_close_skips_set_company ON erp_day_close_skips';
  EXECUTE 'CREATE TRIGGER erp_day_close_skips_set_company BEFORE INSERT ON erp_day_close_skips FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_day_close_skips_read ON erp_day_close_skips';
  EXECUTE 'CREATE POLICY erp_day_close_skips_read ON erp_day_close_skips FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_day_close_skips_write ON erp_day_close_skips';
  EXECUTE 'CREATE POLICY erp_day_close_skips_write ON erp_day_close_skips FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── Close the day: reconcile coverage, persist skips, close or request approval ─
CREATE OR REPLACE FUNCTION erp_close_day(
  p_work_session_id uuid, p_skip_reasons jsonb DEFAULT '[]', p_bulk_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  ws            erp_work_sessions;
  v_co          uuid;
  s             erp_fmcg_settings;
  v_planned     integer;
  v_visited     integer;
  v_skipped     integer;
  v_orders      integer;
  v_no_order    integer;
  v_gps_viol    integer;
  v_oor         integer;
  v_coverage    integer;
  v_close_status text;
  v_skip        record;
  v_has_reason  boolean;
BEGIN
  IF NOT erp_user_has_perm('day.close') THEN
    RAISE EXCEPTION 'not authorized: day.close' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO ws FROM erp_work_sessions WHERE id = p_work_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'work session not found'; END IF;
  SELECT b.company_id INTO v_co FROM erp_branches b WHERE b.id = ws.branch_id;
  IF NOT erp_is_platform_owner() AND v_co IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant day-close denied' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO s FROM erp_fmcg_settings WHERE company_id = v_co;

  -- Planned customers for the session's salesman + work date.
  SELECT count(*)::int INTO v_planned
    FROM erp_today_journey(ws.salesman_id, ws.work_date);

  -- Distinct customers actually visited in this session/salesman/date.
  SELECT count(DISTINCT v.customer_id)::int INTO v_visited
    FROM erp_visits v
   WHERE v.salesman_id = ws.salesman_id
     AND v.visit_date = ws.work_date
     AND (v.work_session_id = p_work_session_id OR v.work_session_id IS NULL);

  v_skipped := GREATEST(v_planned - v_visited, 0);

  -- Orders = visits with an invoice (or not flagged no_sale); no-order = visited & no_sale.
  SELECT count(*)::int INTO v_orders
    FROM erp_visits v
   WHERE v.salesman_id = ws.salesman_id
     AND v.visit_date = ws.work_date
     AND (v.work_session_id = p_work_session_id OR v.work_session_id IS NULL)
     AND (v.invoice_id IS NOT NULL OR v.no_sale = false);

  SELECT count(*)::int INTO v_no_order
    FROM erp_visits v
   WHERE v.salesman_id = ws.salesman_id
     AND v.visit_date = ws.work_date
     AND (v.work_session_id = p_work_session_id OR v.work_session_id IS NULL)
     AND v.no_sale = true;

  -- GPS / out-of-route counts from this session's visits.
  SELECT count(*) FILTER (WHERE v.gps_status = 'violation')::int,
         count(*) FILTER (WHERE v.out_of_route)::int
    INTO v_gps_viol, v_oor
    FROM erp_visits v
   WHERE v.salesman_id = ws.salesman_id
     AND v.visit_date = ws.work_date
     AND (v.work_session_id = p_work_session_id OR v.work_session_id IS NULL);

  v_coverage := CASE WHEN v_planned = 0 THEN 100
                     ELSE round(v_visited::numeric / v_planned * 100)::int END;

  -- Require a reason for skips when configured.
  IF COALESCE(s.day_close_require_reason, true) AND v_skipped > 0 THEN
    v_has_reason := (p_bulk_reason IS NOT NULL AND length(trim(p_bulk_reason)) > 0)
                    OR (jsonb_typeof(p_skip_reasons) = 'array' AND jsonb_array_length(p_skip_reasons) > 0);
    IF NOT v_has_reason THEN
      RAISE EXCEPTION 'a reason is required for skipped customers' USING errcode = 'check_violation';
    END IF;
  END IF;

  -- Persist skip reasons (per-customer entries, else a single bulk-reason row).
  DELETE FROM erp_day_close_skips WHERE work_session_id = p_work_session_id;
  IF jsonb_typeof(p_skip_reasons) = 'array' AND jsonb_array_length(p_skip_reasons) > 0 THEN
    FOR v_skip IN SELECT * FROM jsonb_array_elements(p_skip_reasons) AS e(val) LOOP
      INSERT INTO erp_day_close_skips (company_id, work_session_id, customer_id, reason)
      VALUES (v_co, p_work_session_id,
              NULLIF(v_skip.val->>'customer_id','')::uuid,
              COALESCE(v_skip.val->>'reason', p_bulk_reason));
    END LOOP;
  ELSIF p_bulk_reason IS NOT NULL AND v_skipped > 0 THEN
    INSERT INTO erp_day_close_skips (company_id, work_session_id, customer_id, reason)
    VALUES (v_co, p_work_session_id, NULL, p_bulk_reason);
  END IF;

  -- Below the approval threshold ⇒ pending_approval (do NOT close); else close.
  IF s.day_close_require_approval_below IS NOT NULL AND v_coverage < s.day_close_require_approval_below THEN
    v_close_status := 'pending_approval';
    UPDATE erp_work_sessions SET
      planned_count = v_planned, visited_count = v_visited, skipped_count = v_skipped,
      orders_count = v_orders, no_order_count = v_no_order,
      gps_violation_count = v_gps_viol, out_of_route_count = v_oor,
      coverage_pct = v_coverage, close_status = 'pending_approval',
      close_reason = p_bulk_reason, closed_by = auth.uid()
    WHERE id = p_work_session_id;
  ELSE
    v_close_status := 'closed';
    UPDATE erp_work_sessions SET
      planned_count = v_planned, visited_count = v_visited, skipped_count = v_skipped,
      orders_count = v_orders, no_order_count = v_no_order,
      gps_violation_count = v_gps_viol, out_of_route_count = v_oor,
      coverage_pct = v_coverage, close_status = 'closed', status = 'closed',
      closed_at = now(), close_reason = p_bulk_reason, closed_by = auth.uid()
    WHERE id = p_work_session_id;
  END IF;

  PERFORM erp_log_audit('close_day', 'work_session', p_work_session_id::text,
    jsonb_build_object('planned', v_planned, 'visited', v_visited, 'skipped', v_skipped,
      'orders', v_orders, 'no_order', v_no_order, 'gps_violations', v_gps_viol,
      'out_of_route', v_oor, 'coverage_pct', v_coverage, 'close_status', v_close_status), v_co);

  RETURN jsonb_build_object(
    'work_session_id', p_work_session_id,
    'close_status', v_close_status,
    'planned_count', v_planned,
    'visited_count', v_visited,
    'skipped_count', v_skipped,
    'orders_count', v_orders,
    'no_order_count', v_no_order,
    'gps_violation_count', v_gps_viol,
    'out_of_route_count', v_oor,
    'coverage_pct', v_coverage);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_close_day(uuid, jsonb, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_close_day(uuid, jsonb, text) TO authenticated, service_role;

-- ── Approve an exception day-close (coverage below threshold) ──────────────────
CREATE OR REPLACE FUNCTION erp_approve_day_close(p_work_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE ws erp_work_sessions; v_co uuid;
BEGIN
  IF NOT erp_user_has_perm('day.approve_close_exception') THEN
    RAISE EXCEPTION 'not authorized: day.approve_close_exception' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO ws FROM erp_work_sessions WHERE id = p_work_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'work session not found'; END IF;
  SELECT b.company_id INTO v_co FROM erp_branches b WHERE b.id = ws.branch_id;
  IF NOT erp_is_platform_owner() AND v_co IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;

  UPDATE erp_work_sessions SET
    close_status = 'closed', status = 'closed',
    approved_by = auth.uid(), approved_at = now(), closed_at = now()
  WHERE id = p_work_session_id;

  PERFORM erp_log_audit('approve_close_day', 'work_session', p_work_session_id::text,
    jsonb_build_object('coverage_pct', ws.coverage_pct), v_co);
  RETURN jsonb_build_object('work_session_id', p_work_session_id, 'close_status', 'closed');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_approve_day_close(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_approve_day_close(uuid) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_approve_day_close(uuid);
-- DROP FUNCTION IF EXISTS erp_close_day(uuid, jsonb, text);
-- DROP TABLE IF EXISTS erp_day_close_skips;
-- ALTER TABLE erp_work_sessions DROP COLUMN IF EXISTS planned_count, ... (all added cols);
