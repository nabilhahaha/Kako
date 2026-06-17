-- 0324 — Return Approval Workflow, approver comments.
--
-- Adds an optional p_comment to erp_decide_van_return so an approver can attach a
-- note to an approve OR a reject (the reject reason stays mandatory and is stored
-- in rejection_reason; the comment is supplementary). The comment is recorded in
-- the audit meta of the van_return.approve / van_return.reject entry. Backwards
-- compatible (new trailing arg, defaults NULL). Everything else is unchanged.

-- Drop the previous 3-arg signature so only the 4-arg overload remains.
DROP FUNCTION IF EXISTS public.erp_decide_van_return(uuid,text,text);

CREATE OR REPLACE FUNCTION erp_decide_van_return(
  p_return_id uuid,
  p_decision  text,           -- 'approve' | 'reject'
  p_reason    text DEFAULT NULL,
  p_comment   text DEFAULT NULL
)
RETURNS TABLE(return_id uuid, status text, credit_note_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r erp_sales_returns;
  v_company uuid; v_wh uuid; v_cnid uuid; v_cnno text;
  v_sr_acc uuid; v_ar_acc uuid; v_entry_id uuid;
  v_comment text := NULLIF(btrim(COALESCE(p_comment,'')),'');
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
      jsonb_build_object('return_number', v_r.return_number, 'reason', p_reason, 'comment', v_comment), v_company);
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
    jsonb_build_object('return_number', v_r.return_number, 'total', v_r.total_amount, 'van_warehouse', v_wh, 'credit_note_id', v_cnid, 'comment', v_comment), v_company);

  return_id := v_r.id; status := 'completed'; credit_note_id := v_cnid; RETURN NEXT; RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_decide_van_return(uuid,text,text,text) FROM anon;
