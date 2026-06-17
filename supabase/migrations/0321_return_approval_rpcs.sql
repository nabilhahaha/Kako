-- 0321 — Return Approval Workflow, Phase B (request / decide RPCs).
--
-- erp_request_van_return : prices the lines (server-authoritative, same as
--   erp_van_return) and stores a return in status 'pending_approval' — NO stock
--   movement, NO credit note, NO AR change yet.
-- erp_decide_van_return  : approve → runs the held return's posting exactly once
--   (stock return_in to the requester's van + AR journal + balance + optional credit
--   note) and marks it 'completed'; reject → 'rejected' + reason, no effects.
--   No self-approval; full audit. Both SECURITY DEFINER. Flag platform.return_approval.

ALTER TABLE erp_sales_returns ADD COLUMN IF NOT EXISTS create_credit_note boolean NOT NULL DEFAULT false;

-- ── Request (hold for approval) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_request_van_return(
  p_branch_id          uuid,
  p_customer_id        uuid,
  p_lines              jsonb,
  p_reason_id          uuid,
  p_invoice_id         uuid    DEFAULT NULL,
  p_create_credit_note boolean DEFAULT false,
  p_notes              text    DEFAULT NULL,
  p_return_type        text    DEFAULT 'saleable',
  p_idempotency_key    uuid    DEFAULT NULL
)
RETURNS TABLE(return_id uuid, return_number text, total_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid; v_wh uuid; v_line jsonb; v_pid uuid; v_qty numeric; v_price numeric;
  v_total numeric := 0; v_nlines int := 0; v_priced jsonb := '[]'::jsonb; v_retid uuid; v_retno text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT erp_has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = p_branch_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'branch_not_found'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT r.id, r.return_number, r.total_amount INTO v_retid, v_retno, v_total
      FROM erp_sales_returns r WHERE r.idempotency_key = p_idempotency_key;
    IF FOUND THEN return_id := v_retid; return_number := v_retno; total_amount := v_total; RETURN NEXT; RETURN; END IF;
  END IF;
  v_total := 0; v_nlines := 0; v_priced := '[]'::jsonb; v_retid := NULL; v_retno := NULL;

  IF p_reason_id IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_return_reasons rr WHERE rr.id = p_reason_id AND rr.company_id = v_company AND rr.is_active) THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_customers c WHERE c.id = p_customer_id AND c.company_id = v_company) THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  SELECT w.id INTO v_wh FROM erp_warehouses w WHERE w.branch_id = p_branch_id AND w.is_active AND w.is_van AND w.assigned_to = v_uid ORDER BY w.code LIMIT 1;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no_van_assigned'; END IF;
  IF p_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM erp_invoices i WHERE i.id = p_invoice_id AND i.customer_id = p_customer_id AND i.branch_id = p_branch_id) THEN RAISE EXCEPTION 'invoice_mismatch'; END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'no_valid_lines'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_pid := NULLIF(v_line->>'product_id','')::uuid;
    v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
    IF v_pid IS NULL OR v_qty <= 0 THEN CONTINUE; END IF;
    v_price := NULL;
    IF p_invoice_id IS NOT NULL THEN
      SELECT il.unit_price INTO v_price FROM erp_invoice_lines il WHERE il.invoice_id = p_invoice_id AND il.product_id = v_pid ORDER BY il.unit_price DESC LIMIT 1;
    END IF;
    IF v_price IS NULL THEN SELECT rp.price INTO v_price FROM erp_resolve_price(v_pid, p_customer_id, p_branch_id, v_qty, current_date) rp; END IF;
    v_price := COALESCE(v_price, 0);
    v_total := v_total + round(v_qty * v_price, 2);
    v_nlines := v_nlines + 1;
    v_priced := v_priced || jsonb_build_object('product_id', v_pid, 'quantity', v_qty, 'unit_price', v_price, 'line_total', round(v_qty * v_price, 2));
  END LOOP;
  IF v_nlines = 0 THEN RAISE EXCEPTION 'no_valid_lines'; END IF;
  v_total := round(v_total, 2);

  v_retno := erp_next_number(p_branch_id, 'return');
  INSERT INTO erp_sales_returns(branch_id, customer_id, invoice_id, return_number, status, total_amount,
                                reason_id, notes, created_by, return_type, requested_by, requested_at,
                                create_credit_note, idempotency_key)
  VALUES (p_branch_id, p_customer_id, p_invoice_id, v_retno, 'pending_approval', v_total,
          p_reason_id, NULLIF(btrim(COALESCE(p_notes,'')),''), v_uid, COALESCE(NULLIF(p_return_type,''),'saleable'), v_uid, now(),
          COALESCE(p_create_credit_note,false), p_idempotency_key)
  RETURNING id INTO v_retid;

  INSERT INTO erp_sales_return_lines(return_id, product_id, quantity, unit_price, line_total)
  SELECT v_retid, (l->>'product_id')::uuid, (l->>'quantity')::numeric, (l->>'unit_price')::numeric, (l->>'line_total')::numeric
    FROM jsonb_array_elements(v_priced) l;

  PERFORM erp_log_audit('van_return.request', 'sales_return', v_retid::text,
    jsonb_build_object('return_number', v_retno, 'reason_id', p_reason_id, 'invoice_id', p_invoice_id,
                       'total', v_total, 'lines', v_nlines, 'return_type', p_return_type), v_company);

  return_id := v_retid; return_number := v_retno; total_amount := v_total; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_request_van_return(uuid,uuid,jsonb,uuid,uuid,boolean,text,text,uuid) FROM anon;

-- ── Decide (approve → post once / reject → reason) ───────────────────────────
CREATE OR REPLACE FUNCTION erp_decide_van_return(
  p_return_id uuid,
  p_decision  text,           -- 'approve' | 'reject'
  p_reason    text DEFAULT NULL
)
RETURNS TABLE(return_id uuid, status text, credit_note_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r erp_sales_returns;
  v_company uuid; v_wh uuid; v_cnid uuid; v_cnno text;
  v_sr_acc uuid; v_ar_acc uuid; v_entry_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_r FROM erp_sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'return_not_found'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF v_r.status <> 'pending_approval' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF COALESCE(v_r.requested_by, v_r.created_by) = v_uid THEN RAISE EXCEPTION 'self_approval'; END IF;
  SELECT b.company_id INTO v_company FROM erp_branches b WHERE b.id = v_r.branch_id;

  IF p_decision = 'reject' THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
    UPDATE erp_sales_returns SET status = 'rejected', rejected_by = v_uid, rejected_at = now(), rejection_reason = p_reason WHERE id = p_return_id;
    PERFORM erp_log_audit('van_return.reject', 'sales_return', p_return_id::text,
      jsonb_build_object('return_number', v_r.return_number, 'reason', p_reason), v_company);
    return_id := p_return_id; status := 'rejected'; credit_note_id := NULL; RETURN NEXT; RETURN;
  ELSIF p_decision <> 'approve' THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  -- APPROVE → post the held return (once). Van = the REQUESTER's van.
  SELECT w.id INTO v_wh FROM erp_warehouses w
   WHERE w.branch_id = v_r.branch_id AND w.is_active AND w.is_van AND w.assigned_to = COALESCE(v_r.requested_by, v_r.created_by)
   ORDER BY w.code LIMIT 1;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no_van_assigned'; END IF;

  INSERT INTO erp_stock_movements(movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'return_in', v_wh, srl.product_id, abs(srl.quantity), 'sales_return', v_r.id, 'مرتجع شاحنة (معتمد): ' || v_r.return_number, v_uid
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
    v_cnno := 'CN-' || v_r.return_number;
    INSERT INTO erp_credit_notes(company_id, return_id, invoice_id, credit_note_number, amount, status)
    VALUES (v_company, v_r.id, v_r.invoice_id, v_cnno, v_r.total_amount, 'issued')
    RETURNING id INTO v_cnid;
  END IF;

  UPDATE erp_sales_returns SET status = 'completed', approved_by = v_uid, approved_at = now() WHERE id = v_r.id;

  PERFORM erp_log_audit('van_return.approve', 'sales_return', v_r.id::text,
    jsonb_build_object('return_number', v_r.return_number, 'total', v_r.total_amount, 'van_warehouse', v_wh, 'credit_note_id', v_cnid), v_company);

  return_id := v_r.id; status := 'completed'; credit_note_id := v_cnid; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_decide_van_return(uuid,text,text) FROM anon;
