-- 0327 — End Day Approval & Settlement: salesman withdraw.
--
-- The salesman may WITHDRAW a submitted End Day request ONLY IF no approval stage
-- has acted yet (no stage events). Withdrawing unlocks the day (close_status back
-- to 'open') and removes the held request so the rep can resume or re-submit.
-- SECURITY DEFINER, guarded, audited.

CREATE OR REPLACE FUNCTION erp_withdraw_day_close(p_request_id uuid)
RETURNS TABLE(work_session_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r erp_day_close_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM erp_guard_rpc('day.close.submit');
  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.salesman_id <> v_uid THEN RAISE EXCEPTION 'not_your_day'; END IF;
  IF v_r.status NOT IN ('pending_supervisor','pending_reconciliation','pending_settlement') THEN
    RAISE EXCEPTION 'not_pending';
  END IF;
  -- Only while NO approval stage has acted (any stage event blocks withdrawal).
  IF EXISTS (SELECT 1 FROM erp_day_close_stage_events e WHERE e.request_id = p_request_id) THEN
    RAISE EXCEPTION 'already_acted';
  END IF;

  -- Unlock the day and remove the held request.
  UPDATE erp_work_sessions SET close_status = 'open' WHERE id = v_r.work_session_id;
  DELETE FROM erp_day_close_requests WHERE id = p_request_id;

  PERFORM erp_log_audit('day_close.withdraw', 'work_session', v_r.work_session_id::text,
    jsonb_build_object('request_id', p_request_id), v_r.company_id);

  work_session_id := v_r.work_session_id; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_withdraw_day_close(uuid) FROM anon;
