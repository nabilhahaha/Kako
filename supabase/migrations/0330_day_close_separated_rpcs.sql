-- 0330 — End Day: separated-model RPCs (operational close vs cash/inventory tracks).
--
-- Operational approval (Supervisor Review, or none) is what closes the DAY. Cash
-- settlement and inventory reconciliation are INDEPENDENT tracks that may complete
-- before or after the close — unless the company sets settle_blocks_close /
-- reconcile_blocks_close. Outstanding cash is a carried custody balance.
--   erp_day_close_try_close      : closes the day iff operational approved AND all
--                                  BLOCKING tracks satisfied; else parks status at
--                                  the first unsatisfied blocking track.
--   erp_submit_day_close (replace): seeds expected cash/stock + track statuses.
--   erp_decide_day_close_stage (replace): operational (supervisor) only.
--   erp_settle_day_cash          : full/partial/incremental cash settlement.
--   erp_reconcile_day_stock      : record physical count + variance.
-- All SECURITY DEFINER, guarded, audited. Flag platform.day_close_approval (OFF).

-- Close the day if eligible; else park at the first unsatisfied blocking track.
CREATE OR REPLACE FUNCTION erp_day_close_try_close(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_r erp_day_close_requests; v_p erp_day_close_policies; v_op boolean; v_pending text;
BEGIN
  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_r.status IN ('closed','reopened','supervisor_rejected') THEN RETURN v_r.status; END IF;
  SELECT * INTO v_p FROM erp_day_close_policies WHERE company_id = v_r.company_id;

  v_op := (NOT COALESCE(v_p.supervisor_enabled, false)) OR v_r.supervisor_by IS NOT NULL;
  IF NOT v_op THEN RETURN v_r.status; END IF;  -- still awaiting operational approval

  -- First unsatisfied BLOCKING track (if any) keeps the day open.
  v_pending := NULL;
  IF COALESCE(v_p.settle_enabled, false) AND COALESCE(v_p.settle_blocks_close, false)
     AND v_r.settlement_status NOT IN ('settled','not_required') THEN
    v_pending := 'pending_settlement';
  ELSIF COALESCE(v_p.reconcile_enabled, false) AND COALESCE(v_p.reconcile_blocks_close, false)
     AND v_r.reconcile_status = 'pending' THEN
    v_pending := 'pending_reconciliation';
  END IF;

  IF v_pending IS NULL THEN
    UPDATE erp_day_close_requests SET status = 'closed', closed_by = COALESCE(closed_by, auth.uid()), closed_at = COALESCE(closed_at, now())
      WHERE id = p_request_id;
    UPDATE erp_work_sessions SET status = 'closed', close_status = 'closed', closed_at = now(), closed_by = auth.uid()
      WHERE id = v_r.work_session_id;
    PERFORM erp_log_audit('day_close.closed', 'work_session', v_r.work_session_id::text,
      jsonb_build_object('request_id', p_request_id), v_r.company_id);
    RETURN 'closed';
  ELSE
    IF v_r.status <> v_pending THEN UPDATE erp_day_close_requests SET status = v_pending WHERE id = p_request_id; END IF;
    RETURN v_pending;
  END IF;
END $$;

-- ── Submit (seed expected figures + track statuses) ──────────────────────────
CREATE OR REPLACE FUNCTION erp_submit_day_close(p_work_session_id uuid)
RETURNS TABLE(request_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ws erp_work_sessions; v_company uuid; v_p erp_day_close_policies;
  v_van uuid; v_exp_cash numeric; v_exp_stock numeric; v_settle text; v_recon text; v_status text;
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
  SELECT * INTO v_p FROM erp_day_close_policies WHERE company_id = v_company;
  IF NOT FOUND OR v_p.mode = 'direct' THEN RAISE EXCEPTION 'no_chain'; END IF;  -- direct → caller uses erp_close_day

  -- Expected cash = the day's collections; expected stock = van on-hand.
  SELECT COALESCE(SUM(c.amount),0) INTO v_exp_cash FROM erp_collections c
    WHERE c.received_by = v_uid AND c.created_at >= v_ws.work_date::timestamp AND c.created_at < (v_ws.work_date + 1)::timestamp;
  SELECT w.id INTO v_van FROM erp_warehouses w WHERE w.is_van AND w.is_active AND w.assigned_to = v_uid ORDER BY w.code LIMIT 1;
  SELECT COALESCE(SUM(s.quantity),0) INTO v_exp_stock FROM erp_inventory_stock s WHERE s.warehouse_id = v_van;

  v_settle := CASE WHEN COALESCE(v_p.settle_enabled,false) AND COALESCE(v_exp_cash,0) > 0 THEN 'pending' ELSE 'not_required' END;
  v_recon := CASE
    WHEN NOT COALESCE(v_p.reconcile_enabled,false) THEN 'not_required'
    WHEN v_p.reconcile_cadence = 'not_required' THEN 'not_required'
    WHEN v_p.reconcile_cadence = 'surprise' THEN 'not_due_yet'
    ELSE 'pending' END;
  v_status := CASE WHEN COALESCE(v_p.supervisor_enabled,false) THEN 'pending_supervisor' ELSE 'pending_supervisor' END;

  SELECT * INTO v_req FROM erp_day_close_requests WHERE work_session_id = p_work_session_id FOR UPDATE;
  IF FOUND THEN
    IF v_req.status = 'closed' THEN RAISE EXCEPTION 'already_closed'; END IF;
    IF v_req.status IN ('pending_supervisor','pending_reconciliation','pending_settlement') THEN RAISE EXCEPTION 'already_submitted'; END IF;
    UPDATE erp_day_close_requests SET status = v_status, submitted_at = now(),
      supervisor_by=NULL, supervisor_at=NULL, supervisor_reason=NULL,
      reconcile_by=NULL, reconcile_at=NULL, reconcile_reason=NULL,
      settle_by=NULL, settle_at=NULL, settle_reason=NULL,
      closed_by=NULL, closed_at=NULL,
      expected_cash=v_exp_cash, settled_cash=0, outstanding_cash=v_exp_cash, settlement_status=v_settle,
      expected_stock=v_exp_stock, counted_stock=NULL, stock_variance=NULL, reconcile_status=v_recon, cash_variance=NULL
      WHERE id = v_req.id;
    v_reqid := v_req.id;
  ELSE
    INSERT INTO erp_day_close_requests(company_id, work_session_id, branch_id, salesman_id, status,
      expected_cash, settled_cash, outstanding_cash, settlement_status, expected_stock, reconcile_status)
    VALUES (v_company, p_work_session_id, v_ws.branch_id, v_uid, v_status,
      v_exp_cash, 0, v_exp_cash, v_settle, v_exp_stock, v_recon)
    RETURNING id INTO v_reqid;
  END IF;

  UPDATE erp_work_sessions SET close_status = 'pending_approval' WHERE id = p_work_session_id;
  PERFORM erp_log_audit('day_close.submit', 'work_session', p_work_session_id::text,
    jsonb_build_object('request_id', v_reqid, 'expected_cash', v_exp_cash, 'expected_stock', v_exp_stock), v_company);

  -- No operational stage ⇒ evaluate close immediately (tracks may still gate).
  v_status := COALESCE(erp_day_close_try_close(v_reqid), v_status);
  request_id := v_reqid; status := v_status; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_submit_day_close(uuid) FROM anon;

-- ── Operational stage decision (Supervisor Review only) ──────────────────────
CREATE OR REPLACE FUNCTION erp_decide_day_close_stage(
  p_request_id uuid, p_stage text, p_decision text,
  p_reason text DEFAULT NULL, p_comment text DEFAULT NULL, p_variance numeric DEFAULT NULL, p_payload jsonb DEFAULT NULL
)
RETURNS TABLE(request_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_r erp_day_close_requests; v_p erp_day_close_policies; v_new text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_stage <> 'supervisor' THEN RAISE EXCEPTION 'use_track_rpc'; END IF;  -- settle/reconcile have their own RPCs
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  PERFORM erp_guard_rpc('day.close.supervisor');
  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.status <> 'pending_supervisor' THEN RAISE EXCEPTION 'not_current_stage'; END IF;
  IF v_r.salesman_id = v_uid THEN RAISE EXCEPTION 'self_approval'; END IF;
  SELECT * INTO v_p FROM erp_day_close_policies WHERE company_id = v_r.company_id;
  IF COALESCE(v_p.separation_of_duties,false) AND EXISTS (SELECT 1 FROM erp_day_close_stage_events e WHERE e.request_id = p_request_id AND e.actor = v_uid) THEN
    RAISE EXCEPTION 'separation_of_duties';
  END IF;

  IF p_decision = 'reject' THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
    UPDATE erp_day_close_requests SET status = 'supervisor_rejected', supervisor_reason = p_reason WHERE id = p_request_id;
    INSERT INTO erp_day_close_stage_events(request_id, stage, decision, actor, decided_at, reason, comment)
      VALUES (p_request_id, 'supervisor', 'reject', v_uid, now(), p_reason, NULLIF(btrim(COALESCE(p_comment,'')),''));
    UPDATE erp_work_sessions SET close_status = 'open' WHERE id = v_r.work_session_id;  -- return to salesman
    PERFORM erp_log_audit('day_close.supervisor.reject', 'work_session', v_r.work_session_id::text,
      jsonb_build_object('request_id', p_request_id, 'reason', p_reason), v_r.company_id);
    request_id := p_request_id; status := 'supervisor_rejected'; RETURN NEXT; RETURN;
  END IF;

  UPDATE erp_day_close_requests SET supervisor_by = v_uid, supervisor_at = now() WHERE id = p_request_id;
  INSERT INTO erp_day_close_stage_events(request_id, stage, decision, actor, decided_at, comment)
    VALUES (p_request_id, 'supervisor', 'approve', v_uid, now(), NULLIF(btrim(COALESCE(p_comment,'')),''));
  PERFORM erp_log_audit('day_close.supervisor.approve', 'work_session', v_r.work_session_id::text,
    jsonb_build_object('request_id', p_request_id), v_r.company_id);
  v_new := erp_day_close_try_close(p_request_id);
  request_id := p_request_id; status := v_new; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_decide_day_close_stage(uuid,text,text,text,text,numeric,jsonb) FROM anon;

-- ── Cash settlement track (full / partial / incremental) ─────────────────────
CREATE OR REPLACE FUNCTION erp_settle_day_cash(p_request_id uuid, p_settled_amount numeric, p_comment text DEFAULT NULL)
RETURNS TABLE(request_id uuid, settlement_status text, outstanding numeric, day_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_r erp_day_close_requests; v_p erp_day_close_policies;
  v_settled numeric; v_out numeric; v_status text; v_day text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM erp_guard_rpc('day.close.settle');
  IF COALESCE(p_settled_amount,0) < 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.salesman_id = v_uid THEN RAISE EXCEPTION 'self_approval'; END IF;
  SELECT * INTO v_p FROM erp_day_close_policies WHERE company_id = v_r.company_id;
  IF COALESCE(v_p.separation_of_duties,false) AND EXISTS (SELECT 1 FROM erp_day_close_stage_events e WHERE e.request_id = p_request_id AND e.actor = v_uid AND e.stage <> 'settle') THEN
    RAISE EXCEPTION 'separation_of_duties';
  END IF;

  v_settled := COALESCE(v_r.settled_cash,0) + p_settled_amount;       -- incremental
  v_out := GREATEST(0, ROUND(COALESCE(v_r.expected_cash,0) - v_settled, 3));
  v_status := CASE
    WHEN COALESCE(v_r.expected_cash,0) <= 0 THEN 'settled'
    WHEN v_out <= 0 THEN 'settled'
    WHEN v_settled <= 0 THEN 'pending'
    WHEN COALESCE(v_p.allow_partial_settlement,true) THEN 'partial' ELSE 'pending' END;

  UPDATE erp_day_close_requests SET settled_cash = v_settled, outstanding_cash = v_out, settlement_status = v_status,
    settle_by = v_uid, settle_at = now(), cash_variance = v_out WHERE id = p_request_id;
  INSERT INTO erp_day_close_stage_events(request_id, stage, decision, actor, decided_at, comment, variance, payload)
    VALUES (p_request_id, 'settle', 'approve', v_uid, now(), NULLIF(btrim(COALESCE(p_comment,'')),''), v_out,
            jsonb_build_object('settled', p_settled_amount, 'settled_total', v_settled));
  PERFORM erp_log_audit('day_close.settle', 'work_session', v_r.work_session_id::text,
    jsonb_build_object('request_id', p_request_id, 'settled', p_settled_amount, 'outstanding', v_out, 'status', v_status), v_r.company_id);

  v_day := erp_day_close_try_close(p_request_id);
  request_id := p_request_id; settlement_status := v_status; outstanding := v_out; day_status := v_day; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_settle_day_cash(uuid,numeric,text) FROM anon;

-- ── Inventory reconciliation track (record count + variance) ─────────────────
CREATE OR REPLACE FUNCTION erp_reconcile_day_stock(p_request_id uuid, p_counted_stock numeric, p_comment text DEFAULT NULL)
RETURNS TABLE(request_id uuid, reconcile_status text, variance numeric, day_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_r erp_day_close_requests; v_p erp_day_close_policies; v_var numeric; v_day text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM erp_guard_rpc('day.close.reconcile');
  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.salesman_id = v_uid THEN RAISE EXCEPTION 'self_approval'; END IF;
  SELECT * INTO v_p FROM erp_day_close_policies WHERE company_id = v_r.company_id;
  IF COALESCE(v_p.separation_of_duties,false) AND EXISTS (SELECT 1 FROM erp_day_close_stage_events e WHERE e.request_id = p_request_id AND e.actor = v_uid AND e.stage <> 'reconcile') THEN
    RAISE EXCEPTION 'separation_of_duties';
  END IF;

  v_var := ROUND(COALESCE(v_r.expected_stock,0) - COALESCE(p_counted_stock,0), 3);
  UPDATE erp_day_close_requests SET counted_stock = p_counted_stock, stock_variance = v_var, reconcile_status = 'reconciled',
    reconcile_by = v_uid, reconcile_at = now() WHERE id = p_request_id;
  INSERT INTO erp_day_close_stage_events(request_id, stage, decision, actor, decided_at, comment, variance, payload)
    VALUES (p_request_id, 'reconcile', 'approve', v_uid, now(), NULLIF(btrim(COALESCE(p_comment,'')),''), v_var,
            jsonb_build_object('counted', p_counted_stock, 'expected', v_r.expected_stock));
  PERFORM erp_log_audit('day_close.reconcile', 'work_session', v_r.work_session_id::text,
    jsonb_build_object('request_id', p_request_id, 'counted', p_counted_stock, 'variance', v_var), v_r.company_id);

  v_day := erp_day_close_try_close(p_request_id);
  request_id := p_request_id; reconcile_status := 'reconciled'; variance := v_var; day_status := v_day; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_reconcile_day_stock(uuid,numeric,text) FROM anon;
