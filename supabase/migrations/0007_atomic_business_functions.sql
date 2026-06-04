-- ============================================================================
-- 0007: Atomic business functions
-- ----------------------------------------------------------------------------
-- Wrap multi-write flows that the app previously orchestrated as several
-- separate calls (stock + journal + balances) into single transactional
-- SECURITY DEFINER functions, so a mid-sequence failure can't leave the data
-- half-updated. Each function authorizes the caller against branch access.
-- Safe to re-run.
-- ============================================================================

-- Branch access check usable inside SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION erp_has_branch_access(p_branch UUID)
RETURNS BOOLEAN AS $$
  SELECT erp_is_super_admin() OR p_branch = ANY(erp_user_branch_ids());
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── Issue an invoice (stock out + AR/Revenue journal + customer balance) ─────
CREATE OR REPLACE FUNCTION erp_issue_invoice(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_inv erp_invoices;
  v_wh UUID;
  v_uid UUID := auth.uid();
  v_line_count INT;
BEGIN
  SELECT * INTO v_inv FROM erp_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF NOT erp_has_branch_access(v_inv.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'لا يمكن إصدار إلا الفواتير المسودة'; END IF;

  SELECT count(*) INTO v_line_count FROM erp_invoice_lines WHERE invoice_id = p_invoice_id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'الفاتورة بلا بنود'; END IF;

  SELECT id INTO v_wh FROM erp_warehouses
    WHERE branch_id = v_inv.branch_id AND is_active = true ORDER BY code LIMIT 1;
  IF v_wh IS NOT NULL THEN
    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    SELECT 'sale_out', v_wh, l.product_id, -abs(l.quantity), 'invoice', p_invoice_id, 'بيع: ' || v_inv.invoice_number, v_uid
    FROM erp_invoice_lines l WHERE l.invoice_id = p_invoice_id;
  END IF;

  UPDATE erp_invoices SET status = 'issued' WHERE id = p_invoice_id; -- fires journal trigger
  UPDATE erp_customers SET balance = balance + v_inv.net_amount WHERE id = v_inv.customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Record a customer payment (payment row fires journal; balance down) ──────
CREATE OR REPLACE FUNCTION erp_record_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_method erp_payment_method,
  p_ref TEXT,
  p_date DATE
)
RETURNS VOID AS $$
DECLARE
  v_inv erp_invoices;
  v_remaining NUMERIC;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_inv FROM erp_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF NOT erp_has_branch_access(v_inv.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_inv.status = 'draft' THEN RAISE EXCEPTION 'أصدر الفاتورة قبل التحصيل'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'الفاتورة ملغية'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر'; END IF;

  v_remaining := v_inv.net_amount - v_inv.paid_amount;
  IF p_amount > v_remaining + 0.001 THEN
    RAISE EXCEPTION 'المبلغ يتجاوز المتبقي (%)', round(v_remaining, 2);
  END IF;

  INSERT INTO erp_payments (invoice_id, amount, payment_method, reference_number, payment_date, received_by)
  VALUES (p_invoice_id, p_amount, p_method, NULLIF(btrim(p_ref), ''), COALESCE(p_date, CURRENT_DATE), v_uid);

  UPDATE erp_customers SET balance = balance - p_amount WHERE id = v_inv.customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
