-- ============================================================================
-- 0026: Enforce customer credit limit when issuing an invoice
-- ----------------------------------------------------------------------------
-- Adds a credit-limit guard to erp_issue_invoice. A customer's credit_limit of
-- 0 / NULL means "no limit" (current behaviour preserved). When a positive
-- limit is set, issuing an invoice that would push the customer's outstanding
-- balance past the limit is blocked. Otherwise identical to 0013. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_issue_invoice(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_inv erp_invoices;
  v_wh UUID;
  v_uid UUID := auth.uid();
  v_line_count INT;
  v_credit NUMERIC;
  v_balance NUMERIC;
BEGIN
  SELECT * INTO v_inv FROM erp_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF NOT erp_has_branch_access(v_inv.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن إصدار إلا الفواتير المسودة'; END IF;

  SELECT count(*) INTO v_line_count FROM erp_invoice_lines WHERE invoice_id = p_invoice_id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'الفاتورة بلا بنود'; END IF;

  -- Credit-limit guard: only when the customer has a positive limit set.
  SELECT credit_limit, balance INTO v_credit, v_balance
    FROM erp_customers WHERE id = v_inv.customer_id;
  IF v_credit IS NOT NULL AND v_credit > 0
     AND (COALESCE(v_balance, 0) + v_inv.net_amount) > v_credit THEN
    RAISE EXCEPTION 'تجاوز حد ائتمان العميل (الحد %، المديونية الحالية %، قيمة الفاتورة %).',
      v_credit, COALESCE(v_balance, 0), v_inv.net_amount;
  END IF;

  -- 1) the seller's own van in this branch
  SELECT id INTO v_wh FROM erp_warehouses
    WHERE branch_id = v_inv.branch_id AND is_active = true AND is_van = true
      AND assigned_to = v_inv.created_by
    ORDER BY code LIMIT 1;
  -- 2) the branch's first active non-van warehouse (preseller / office)
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM erp_warehouses
      WHERE branch_id = v_inv.branch_id AND is_active = true AND is_van = false
      ORDER BY code LIMIT 1;
  END IF;
  -- 3) any active warehouse
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM erp_warehouses
      WHERE branch_id = v_inv.branch_id AND is_active = true
      ORDER BY code LIMIT 1;
  END IF;

  IF v_wh IS NOT NULL THEN
    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    SELECT 'sale_out', v_wh, l.product_id, -abs(l.quantity), 'invoice', p_invoice_id, 'بيع: ' || v_inv.invoice_number, v_uid
    FROM erp_invoice_lines l WHERE l.invoice_id = p_invoice_id;
  END IF;

  UPDATE erp_invoices SET status = 'issued' WHERE id = p_invoice_id;
  UPDATE erp_customers SET balance = balance + v_inv.net_amount WHERE id = v_inv.customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
