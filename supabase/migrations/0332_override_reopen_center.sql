-- 0332 — Override & Reopen Center (controlled, audited exception actions).
--
-- No silent bypass: every override REQUIRES a reason, is AUDITED, and records the
-- override actor/time. Authorized users only (returns.override / day.close.override
-- / day.reopen), enforced at the action layer + erp_guard_rpc.

ALTER TABLE erp_sales_returns
  ADD COLUMN IF NOT EXISTS override_by     uuid,
  ADD COLUMN IF NOT EXISTS override_at     timestamptz,
  ADD COLUMN IF NOT EXISTS override_reason text;

-- ── Return override: force approve (post) / force reject ──────────────────────
CREATE OR REPLACE FUNCTION erp_override_van_return(
  p_return_id uuid, p_decision text, p_reason text, p_comment text DEFAULT NULL
)
RETURNS TABLE(return_id uuid, status text, credit_note_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_r erp_sales_returns; v_company uuid; v_wh uuid; v_cnid uuid;
  v_sr_acc uuid; v_ar_acc uuid; v_entry_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM erp_guard_rpc('returns.override');
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO v_r FROM erp_sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'return_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.status = 'completed' THEN RAISE EXCEPTION 'already_completed'; END IF;
  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = v_r.branch_id;

  IF p_decision = 'reject' THEN
    UPDATE erp_sales_returns SET status = 'rejected', rejected_by = v_uid, rejected_at = now(),
      rejection_reason = COALESCE(rejection_reason, p_reason),
      override_by = v_uid, override_at = now(), override_reason = p_reason
      WHERE id = p_return_id;
    PERFORM erp_log_audit('van_return.override_reject', 'sales_return', p_return_id::text,
      jsonb_build_object('return_number', v_r.return_number, 'reason', p_reason, 'comment', p_comment), v_company);
    return_id := p_return_id; status := 'rejected'; credit_note_id := NULL; RETURN NEXT; RETURN;
  END IF;

  -- FORCE APPROVE → post the return to the requester's van (once), like decide-approve.
  SELECT w.id INTO v_wh FROM erp_warehouses w
   WHERE w.branch_id = v_r.branch_id AND w.is_active AND w.is_van AND w.assigned_to = COALESCE(v_r.requested_by, v_r.created_by)
   ORDER BY w.code LIMIT 1;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no_van_assigned'; END IF;

  INSERT INTO erp_stock_movements(movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'return_in', v_wh, srl.product_id, abs(srl.quantity), 'sales_return', v_r.id, 'مرتجع شاحنة (تجاوز): ' || v_r.return_number, v_uid
    FROM erp_sales_return_lines srl WHERE srl.return_id = v_r.id;

  IF v_r.total_amount > 0 THEN
    SELECT id INTO v_sr_acc FROM erp_chart_of_accounts WHERE code = '4110' AND is_system = true;
    SELECT id INTO v_ar_acc FROM erp_chart_of_accounts WHERE code = '1200' AND is_system = true;
    IF v_sr_acc IS NOT NULL AND v_ar_acc IS NOT NULL THEN
      INSERT INTO erp_journal_entries(entry_number, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_r.branch_id, 'journal'), 'مرتجع شاحنة ' || v_r.return_number, 'sales_return', v_r.id, v_r.branch_id, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry_id;
      INSERT INTO erp_journal_lines(journal_entry_id, account_id, debit, credit, description) VALUES
        (v_entry_id, v_sr_acc, v_r.total_amount, 0, 'مرتجع ' || v_r.return_number),
        (v_entry_id, v_ar_acc, 0, v_r.total_amount, 'مرتجع ' || v_r.return_number);
    END IF;
  END IF;

  UPDATE erp_customers SET balance = balance - v_r.total_amount WHERE id = v_r.customer_id;

  IF v_r.create_credit_note THEN
    INSERT INTO erp_credit_notes(company_id, return_id, invoice_id, credit_note_number, amount, status)
    VALUES (v_company, v_r.id, v_r.invoice_id, 'CN-' || v_r.return_number, v_r.total_amount, 'issued')
    RETURNING id INTO v_cnid;
  END IF;

  UPDATE erp_sales_returns SET status = 'completed', approved_by = v_uid, approved_at = now(),
    override_by = v_uid, override_at = now(), override_reason = p_reason WHERE id = v_r.id;

  PERFORM erp_log_audit('van_return.override_approve', 'sales_return', v_r.id::text,
    jsonb_build_object('return_number', v_r.return_number, 'total', v_r.total_amount, 'reason', p_reason, 'comment', p_comment, 'credit_note_id', v_cnid), v_company);

  return_id := v_r.id; status := 'completed'; credit_note_id := v_cnid; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_override_van_return(uuid,text,text,text) FROM anon;

-- ── Day close: force close (override stuck/blocked chain) ─────────────────────
CREATE OR REPLACE FUNCTION erp_override_day_close(p_request_id uuid, p_reason text, p_comment text DEFAULT NULL)
RETURNS TABLE(request_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_r erp_day_close_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM erp_guard_rpc('day.close.override');
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.status = 'closed' THEN RAISE EXCEPTION 'already_closed'; END IF;

  UPDATE erp_day_close_requests SET status = 'closed', closed_by = v_uid, closed_at = now() WHERE id = p_request_id;
  UPDATE erp_work_sessions SET status = 'closed', close_status = 'closed', closed_at = now(), closed_by = v_uid WHERE id = v_r.work_session_id;
  INSERT INTO erp_day_close_stage_events(request_id, stage, decision, actor, decided_at, reason, comment)
    VALUES (p_request_id, 'supervisor', 'approve', v_uid, now(), p_reason, NULLIF(btrim(COALESCE(p_comment,'')),''));
  PERFORM erp_log_audit('day_close.override', 'work_session', v_r.work_session_id::text,
    jsonb_build_object('request_id', p_request_id, 'reason', p_reason, 'comment', p_comment, 'from_status', v_r.status), v_r.company_id);

  request_id := p_request_id; status := 'closed'; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_override_day_close(uuid,text,text) FROM anon;

-- ── Day close: reopen a CLOSED day (controlled) ──────────────────────────────
CREATE OR REPLACE FUNCTION erp_reopen_day_close(p_request_id uuid, p_reason text, p_comment text DEFAULT NULL)
RETURNS TABLE(request_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_r erp_day_close_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM erp_guard_rpc('day.reopen');
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO v_r FROM erp_day_close_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.status <> 'closed' THEN RAISE EXCEPTION 'not_closed'; END IF;

  UPDATE erp_day_close_requests SET status = 'reopened', reopened_by = v_uid, reopened_at = now(), reopen_reason = p_reason WHERE id = p_request_id;
  UPDATE erp_work_sessions SET status = 'open', close_status = 'open', closed_at = NULL WHERE id = v_r.work_session_id;
  PERFORM erp_log_audit('day_close.reopen', 'work_session', v_r.work_session_id::text,
    jsonb_build_object('request_id', p_request_id, 'reason', p_reason, 'comment', p_comment), v_r.company_id);

  request_id := p_request_id; status := 'reopened'; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_reopen_day_close(uuid,text,text) FROM anon;
