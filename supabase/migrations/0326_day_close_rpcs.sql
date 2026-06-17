-- 0326 — End Day Approval & Settlement, Phase B (submit / decide-stage RPCs).
--
-- erp_submit_day_close : the salesman submits End Day. The day is LOCKED (the work
--   session's close_status becomes 'pending_approval', so the existing
--   isVanDayOpen guard blocks further sell/collect/return) and a day-close request
--   is created at the first enabled stage. NOT closed.
-- erp_decide_day_close_stage : a stage actor approves (advance to next enabled
--   stage, or close the day on the last) or rejects (mandatory reason). Each action
--   writes a NON-collapsed audit row. No self-approval; separation-of-duties honored
--   when the policy requires it. Both SECURITY DEFINER, guarded, audited, flag
--   platform.day_close_approval.

-- Ordered, enabled stage chain for a company (pure policy data → array). '{}' = direct.
CREATE OR REPLACE FUNCTION erp_day_close_chain(p_company uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_p erp_day_close_policies; v_order text[]; v_res text[] := '{}'; s text; c text;
BEGIN
  SELECT * INTO v_p FROM erp_day_close_policies WHERE company_id = p_company;
  IF NOT FOUND OR v_p.mode = 'direct' THEN RETURN '{}'; END IF;
  v_order := COALESCE(v_p.stage_order, ARRAY['supervisor','reconcile','settle']);
  FOREACH c IN ARRAY ARRAY['supervisor','reconcile','settle'] LOOP
    IF NOT (c = ANY(v_order)) THEN v_order := array_append(v_order, c); END IF;
  END LOOP;
  FOREACH s IN ARRAY v_order LOOP
    IF (s = 'supervisor' AND v_p.supervisor_enabled)
       OR (s = 'reconcile' AND v_p.reconcile_enabled)
       OR (s = 'settle' AND v_p.settle_enabled) THEN
      v_res := array_append(v_res, s);
    END IF;
  END LOOP;
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION erp_day_close_pending_status(p_stage text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_stage WHEN 'supervisor' THEN 'pending_supervisor'
                      WHEN 'reconcile'  THEN 'pending_reconciliation'
                      ELSE 'pending_settlement' END;
$$;

-- ── Submit End Day (lock + create request) ───────────────────────────────────
CREATE OR REPLACE FUNCTION erp_submit_day_close(p_work_session_id uuid)
RETURNS TABLE(request_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws erp_work_sessions; v_company uuid; v_chain text[]; v_first text; v_status text;
  v_req erp_day_close_requests; v_reqid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM erp_guard_rpc('day.close.submit');
  SELECT * INTO v_ws FROM erp_work_sessions WHERE id = p_work_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF NOT erp_has_branch_access(v_ws.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_ws.salesman_id <> v_uid THEN RAISE EXCEPTION 'not_your_day'; END IF;
  IF v_ws.status = 'closed' THEN RAISE EXCEPTION 'already_closed'; END IF;

  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = v_ws.branch_id;
  v_chain := erp_day_close_chain(v_company);
  IF array_length(v_chain, 1) IS NULL THEN RAISE EXCEPTION 'no_chain'; END IF;  -- direct → caller uses erp_close_day
  v_first := v_chain[1];
  v_status := erp_day_close_pending_status(v_first);

  SELECT * INTO v_req FROM erp_day_close_requests WHERE work_session_id = p_work_session_id FOR UPDATE;
  IF FOUND THEN
    IF v_req.status = 'closed' THEN RAISE EXCEPTION 'already_closed'; END IF;
    IF v_req.status IN ('pending_supervisor','pending_reconciliation','pending_settlement') THEN RAISE EXCEPTION 'already_submitted'; END IF;
    -- rejected / reopened → re-submit: reset to the first stage.
    UPDATE erp_day_close_requests SET status = v_status, submitted_at = now(),
      supervisor_by=NULL, supervisor_at=NULL, supervisor_reason=NULL,
      reconcile_by=NULL, reconcile_at=NULL, reconcile_reason=NULL, stock_variance=NULL,
      settle_by=NULL, settle_at=NULL, settle_reason=NULL, cash_variance=NULL,
      closed_by=NULL, closed_at=NULL
      WHERE id = v_req.id;
    v_reqid := v_req.id;
  ELSE
    INSERT INTO erp_day_close_requests(company_id, work_session_id, branch_id, salesman_id, status)
    VALUES (v_company, p_work_session_id, v_ws.branch_id, v_uid, v_status)
    RETURNING id INTO v_reqid;
  END IF;

  -- Lock the day: existing isVanDayOpen guard treats pending_approval as not-open.
  UPDATE erp_work_sessions SET close_status = 'pending_approval' WHERE id = p_work_session_id;

  PERFORM erp_log_audit('day_close.submit', 'work_session', p_work_session_id::text,
    jsonb_build_object('request_id', v_reqid, 'status', v_status, 'chain', v_chain), v_company);

  request_id := v_reqid; status := v_status; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_submit_day_close(uuid) FROM anon;

-- ── Decide a stage (approve → advance/close, reject → reason) ─────────────────
CREATE OR REPLACE FUNCTION erp_decide_day_close_stage(
  p_request_id uuid,
  p_stage      text,           -- 'supervisor' | 'reconcile' | 'settle'
  p_decision   text,           -- 'approve' | 'reject'
  p_reason     text DEFAULT NULL,
  p_comment    text DEFAULT NULL,
  p_variance   numeric DEFAULT NULL,
  p_payload    jsonb DEFAULT NULL
)
RETURNS TABLE(request_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r erp_day_close_requests; v_company uuid; v_p erp_day_close_policies;
  v_chain text[]; v_idx int; v_next text; v_new text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_stage NOT IN ('supervisor','reconcile','settle') THEN RAISE EXCEPTION 'invalid_stage'; END IF;
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  PERFORM erp_guard_rpc('day.close.' || p_stage);

  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.status <> erp_day_close_pending_status(p_stage) THEN RAISE EXCEPTION 'not_current_stage'; END IF;
  IF v_r.salesman_id = v_uid THEN RAISE EXCEPTION 'self_approval'; END IF;
  v_company := v_r.company_id;

  -- Separation of duties: when required, a prior-stage actor cannot act again.
  SELECT * INTO v_p FROM erp_day_close_policies WHERE company_id = v_company;
  IF COALESCE(v_p.separation_of_duties, false)
     AND EXISTS (SELECT 1 FROM erp_day_close_stage_events e WHERE e.request_id = p_request_id AND e.actor = v_uid) THEN
    RAISE EXCEPTION 'separation_of_duties';
  END IF;

  IF p_decision = 'reject' THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
    v_new := CASE p_stage WHEN 'supervisor' THEN 'supervisor_rejected'
                          WHEN 'reconcile'  THEN 'reconciliation_rejected'
                          ELSE 'settlement_rejected' END;
    UPDATE erp_day_close_requests SET status = v_new,
      supervisor_reason = CASE WHEN p_stage='supervisor' THEN p_reason ELSE supervisor_reason END,
      reconcile_reason  = CASE WHEN p_stage='reconcile'  THEN p_reason ELSE reconcile_reason  END,
      settle_reason     = CASE WHEN p_stage='settle'     THEN p_reason ELSE settle_reason     END
      WHERE id = p_request_id;
    INSERT INTO erp_day_close_stage_events(request_id, stage, decision, actor, decided_at, reason, comment, variance, payload)
    VALUES (p_request_id, p_stage, 'reject', v_uid, now(), p_reason, NULLIF(btrim(COALESCE(p_comment,'')),''), p_variance, p_payload);
    -- Supervisor rejection returns the day to the salesman (unlock for re-edit).
    IF p_stage = 'supervisor' THEN
      UPDATE erp_work_sessions SET close_status = 'open' WHERE id = v_r.work_session_id;
    END IF;
    PERFORM erp_log_audit('day_close.' || p_stage || '.reject', 'work_session', v_r.work_session_id::text,
      jsonb_build_object('request_id', p_request_id, 'reason', p_reason), v_company);
    request_id := p_request_id; status := v_new; RETURN NEXT; RETURN;
  END IF;

  -- APPROVE → record the stage, then advance or close.
  UPDATE erp_day_close_requests SET
    supervisor_by = CASE WHEN p_stage='supervisor' THEN v_uid ELSE supervisor_by END,
    supervisor_at = CASE WHEN p_stage='supervisor' THEN now() ELSE supervisor_at END,
    reconcile_by  = CASE WHEN p_stage='reconcile'  THEN v_uid ELSE reconcile_by END,
    reconcile_at  = CASE WHEN p_stage='reconcile'  THEN now() ELSE reconcile_at END,
    stock_variance = CASE WHEN p_stage='reconcile' THEN p_variance ELSE stock_variance END,
    settle_by     = CASE WHEN p_stage='settle'     THEN v_uid ELSE settle_by END,
    settle_at     = CASE WHEN p_stage='settle'     THEN now() ELSE settle_at END,
    cash_variance = CASE WHEN p_stage='settle'     THEN p_variance ELSE cash_variance END
    WHERE id = p_request_id;
  INSERT INTO erp_day_close_stage_events(request_id, stage, decision, actor, decided_at, comment, variance, payload)
  VALUES (p_request_id, p_stage, 'approve', v_uid, now(), NULLIF(btrim(COALESCE(p_comment,'')),''), p_variance, p_payload);

  v_chain := erp_day_close_chain(v_company);
  v_idx := array_position(v_chain, p_stage);
  v_next := CASE WHEN v_idx IS NULL OR v_idx >= array_length(v_chain,1) THEN NULL ELSE v_chain[v_idx + 1] END;

  IF v_next IS NULL THEN
    -- Final stage approved → the day is truly Closed.
    UPDATE erp_day_close_requests SET status = 'closed', closed_by = v_uid, closed_at = now() WHERE id = p_request_id;
    UPDATE erp_work_sessions SET status = 'closed', close_status = 'closed', closed_at = now(), closed_by = v_uid
      WHERE id = v_r.work_session_id;
    PERFORM erp_log_audit('day_close.closed', 'work_session', v_r.work_session_id::text,
      jsonb_build_object('request_id', p_request_id, 'final_stage', p_stage), v_company);
    request_id := p_request_id; status := 'closed'; RETURN NEXT; RETURN;
  ELSE
    v_new := erp_day_close_pending_status(v_next);
    UPDATE erp_day_close_requests SET status = v_new WHERE id = p_request_id;
    PERFORM erp_log_audit('day_close.' || p_stage || '.approve', 'work_session', v_r.work_session_id::text,
      jsonb_build_object('request_id', p_request_id, 'next', v_new), v_company);
    request_id := p_request_id; status := v_new; RETURN NEXT; RETURN;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_decide_day_close_stage(uuid,text,text,text,text,numeric,jsonb) FROM anon;
