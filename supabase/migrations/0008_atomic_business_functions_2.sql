-- ============================================================================
-- 0008: Atomic business functions (part 2)
-- ----------------------------------------------------------------------------
-- Transactional SECURITY DEFINER wrappers for the remaining multi-write flows:
-- goods receipt, sales return, supplier payment, stock transfer, and voucher
-- posting. Each authorizes the caller via erp_has_branch_access. Safe to re-run.
-- ============================================================================

-- ─── Receive a purchase order in full into a warehouse ────────────────────────
CREATE OR REPLACE FUNCTION erp_receive_purchase_order(
  p_po_id UUID,
  p_warehouse_id UUID,
  p_details JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID AS $$
DECLARE
  v_po erp_purchase_orders;
  v_uid UUID := auth.uid();
  v_gr_id UUID;
  v_gr_number TEXT;
  v_inv_acc UUID;
  v_ap_acc UUID;
  v_entry_id UUID;
BEGIN
  SELECT * INTO v_po FROM erp_purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أمر الشراء غير موجود'; END IF;
  IF NOT erp_has_branch_access(v_po.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_po.status = 'received' THEN RAISE EXCEPTION 'تم استلام هذا الأمر بالفعل'; END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'أمر الشراء ملغي'; END IF;
  IF p_warehouse_id IS NULL THEN RAISE EXCEPTION 'اختر المخزن المستلِم'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_purchase_order_lines WHERE purchase_order_id = p_po_id) THEN
    RAISE EXCEPTION 'أمر الشراء بلا بنود';
  END IF;

  v_gr_number := erp_next_number(v_po.branch_id, 'goods_receipt');
  INSERT INTO erp_goods_receipts (purchase_order_id, warehouse_id, receipt_number, received_by)
  VALUES (p_po_id, p_warehouse_id, v_gr_number, v_uid) RETURNING id INTO v_gr_id;

  -- Receipt lines (with optional batch/expiry from p_details) -> trigger adds stock.
  INSERT INTO erp_goods_receipt_lines (goods_receipt_id, product_id, quantity_received, batch_number, expiry_date)
  SELECT v_gr_id, l.product_id, l.quantity,
    (SELECT NULLIF(btrim(d->>'batch_number'), '') FROM jsonb_array_elements(COALESCE(p_details, '[]'::jsonb)) d
       WHERE d->>'product_id' = l.product_id::text LIMIT 1),
    (SELECT NULLIF(d->>'expiry_date', '') FROM jsonb_array_elements(COALESCE(p_details, '[]'::jsonb)) d
       WHERE d->>'product_id' = l.product_id::text LIMIT 1)::date
  FROM erp_purchase_order_lines l WHERE l.purchase_order_id = p_po_id;

  UPDATE erp_purchase_order_lines SET received_qty = quantity WHERE purchase_order_id = p_po_id;
  UPDATE erp_purchase_orders SET status = 'received' WHERE id = p_po_id;

  IF v_po.net_amount > 0 THEN
    SELECT id INTO v_inv_acc FROM erp_chart_of_accounts WHERE code = '1300' AND is_system = true;
    SELECT id INTO v_ap_acc FROM erp_chart_of_accounts WHERE code = '2100' AND is_system = true;
    IF v_inv_acc IS NOT NULL AND v_ap_acc IS NOT NULL THEN
      INSERT INTO erp_journal_entries (entry_number, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_po.branch_id, 'journal'), 'استلام بضاعة ' || v_gr_number || ' لأمر الشراء ' || v_po.po_number,
              'goods_receipt', v_gr_id, v_po.branch_id, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry_id;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES
        (v_entry_id, v_inv_acc, v_po.net_amount, 0, 'مخزون - ' || v_gr_number),
        (v_entry_id, v_ap_acc, 0, v_po.net_amount, 'موردون - ' || v_gr_number);
    END IF;
  END IF;

  UPDATE erp_suppliers SET balance = balance + v_po.net_amount WHERE id = v_po.supplier_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Complete a sales return (restock + contra-revenue journal + balance) ─────
CREATE OR REPLACE FUNCTION erp_complete_sales_return(p_return_id UUID)
RETURNS VOID AS $$
DECLARE
  v_ret erp_sales_returns;
  v_uid UUID := auth.uid();
  v_wh UUID;
  v_sr_acc UUID;
  v_ar_acc UUID;
  v_entry_id UUID;
BEGIN
  SELECT * INTO v_ret FROM erp_sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المرتجع غير موجود'; END IF;
  IF NOT erp_has_branch_access(v_ret.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_ret.status = 'completed' THEN RAISE EXCEPTION 'تم اعتماد هذا المرتجع بالفعل'; END IF;
  IF v_ret.status = 'cancelled' THEN RAISE EXCEPTION 'المرتجع ملغي'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_sales_return_lines WHERE return_id = p_return_id) THEN
    RAISE EXCEPTION 'المرتجع بلا بنود';
  END IF;

  SELECT id INTO v_wh FROM erp_warehouses
    WHERE branch_id = v_ret.branch_id AND is_active = true ORDER BY code LIMIT 1;
  IF v_wh IS NOT NULL THEN
    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    SELECT 'return_in', v_wh, l.product_id, abs(l.quantity), 'sales_return', p_return_id, 'مرتجع: ' || v_ret.return_number, v_uid
    FROM erp_sales_return_lines l WHERE l.return_id = p_return_id;
  END IF;

  IF v_ret.total_amount > 0 THEN
    SELECT id INTO v_sr_acc FROM erp_chart_of_accounts WHERE code = '4110' AND is_system = true;
    SELECT id INTO v_ar_acc FROM erp_chart_of_accounts WHERE code = '1200' AND is_system = true;
    IF v_sr_acc IS NOT NULL AND v_ar_acc IS NOT NULL THEN
      INSERT INTO erp_journal_entries (entry_number, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_ret.branch_id, 'journal'), 'مرتجع مبيعات ' || v_ret.return_number,
              'sales_return', p_return_id, v_ret.branch_id, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry_id;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES
        (v_entry_id, v_sr_acc, v_ret.total_amount, 0, 'مرتجع ' || v_ret.return_number),
        (v_entry_id, v_ar_acc, 0, v_ret.total_amount, 'مرتجع ' || v_ret.return_number);
    END IF;
  END IF;

  UPDATE erp_customers SET balance = balance - v_ret.total_amount WHERE id = v_ret.customer_id;
  UPDATE erp_sales_returns SET status = 'completed', approved_by = v_uid WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Record a supplier payment (settle payable + AP/Cash journal) ─────────────
CREATE OR REPLACE FUNCTION erp_record_supplier_payment(
  p_supplier_id UUID,
  p_branch_id UUID,
  p_amount NUMERIC,
  p_method erp_payment_method,
  p_ref TEXT,
  p_date DATE
)
RETURNS VOID AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cash UUID;
  v_ap UUID;
  v_entry_id UUID;
  v_date DATE := COALESCE(p_date, CURRENT_DATE);
BEGIN
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'اختر الفرع الذي يصرف المبلغ'; END IF;
  IF NOT erp_has_branch_access(p_branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'المبلغ يجب أن يكون أكبر من صفر'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_suppliers WHERE id = p_supplier_id) THEN RAISE EXCEPTION 'المورد غير موجود'; END IF;

  INSERT INTO erp_supplier_payments (supplier_id, amount, payment_method, reference_number, payment_date, created_by)
  VALUES (p_supplier_id, p_amount, p_method, NULLIF(btrim(p_ref), ''), v_date, v_uid);

  UPDATE erp_suppliers SET balance = balance - p_amount WHERE id = p_supplier_id;

  SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = '1100' AND is_system = true;
  SELECT id INTO v_ap FROM erp_chart_of_accounts WHERE code = '2100' AND is_system = true;
  IF v_cash IS NOT NULL AND v_ap IS NOT NULL THEN
    INSERT INTO erp_journal_entries (entry_number, entry_date, description, reference_type, branch_id, status, created_by, posted_by, posted_at)
    VALUES (erp_next_number(p_branch_id, 'journal'), v_date, 'سداد دفعة لمورد', 'supplier_payment', p_branch_id, 'posted', v_uid, v_uid, now())
    RETURNING id INTO v_entry_id;
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES
      (v_entry_id, v_ap, p_amount, 0, 'موردون - سداد'),
      (v_entry_id, v_cash, 0, p_amount, 'نقدية - سداد');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Complete a warehouse transfer (paired out/in movements) ──────────────────
CREATE OR REPLACE FUNCTION erp_complete_transfer(p_transfer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_order erp_transfer_orders;
  v_uid UUID := auth.uid();
  v_branch UUID;
BEGIN
  SELECT * INTO v_order FROM erp_transfer_orders WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أمر التحويل غير موجود'; END IF;
  SELECT branch_id INTO v_branch FROM erp_warehouses WHERE id = v_order.from_warehouse_id;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_order.status = 'received' THEN RAISE EXCEPTION 'تم تنفيذ هذا التحويل بالفعل'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'أمر التحويل ملغي'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_transfer_order_lines WHERE transfer_order_id = p_transfer_id) THEN
    RAISE EXCEPTION 'أمر التحويل بلا بنود';
  END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_out', v_order.from_warehouse_id, l.product_id, -abs(l.quantity), 'transfer', p_transfer_id, 'تحويل صادر: ' || v_order.transfer_number, v_uid
  FROM erp_transfer_order_lines l WHERE l.transfer_order_id = p_transfer_id;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_in', v_order.to_warehouse_id, l.product_id, abs(l.quantity), 'transfer', p_transfer_id, 'تحويل وارد: ' || v_order.transfer_number, v_uid
  FROM erp_transfer_order_lines l WHERE l.transfer_order_id = p_transfer_id;

  UPDATE erp_transfer_order_lines SET received_qty = quantity WHERE transfer_order_id = p_transfer_id;
  UPDATE erp_transfer_orders SET status = 'received' WHERE id = p_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Post payment/receipt vouchers ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_post_payment_voucher(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v erp_payment_vouchers;
  v_uid UUID := auth.uid();
  v_cash UUID;
  v_entry_id UUID;
BEGIN
  SELECT * INTO v FROM erp_payment_vouchers WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'السند غير موجود'; END IF;
  IF NOT erp_has_branch_access(v.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v.status = 'posted' THEN RAISE EXCEPTION 'تم ترحيل السند بالفعل'; END IF;
  IF v.status = 'cancelled' THEN RAISE EXCEPTION 'السند ملغي'; END IF;

  SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = '1100' AND is_system = true;
  IF v_cash IS NULL THEN RAISE EXCEPTION 'حساب النقدية غير موجود'; END IF;

  INSERT INTO erp_journal_entries (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
  VALUES (erp_next_number(v.branch_id, 'journal'), v.voucher_date, 'سند صرف ' || v.voucher_number || ' - ' || v.payee,
          'payment_voucher', p_id, v.branch_id, 'posted', v_uid, v_uid, now())
  RETURNING id INTO v_entry_id;
  INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
    (v_entry_id, v.account_id, v.amount, 0),
    (v_entry_id, v_cash, 0, v.amount);

  UPDATE erp_payment_vouchers SET status = 'posted', approved_by = v_uid WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION erp_post_receipt_voucher(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v erp_receipt_vouchers;
  v_uid UUID := auth.uid();
  v_cash UUID;
  v_entry_id UUID;
BEGIN
  SELECT * INTO v FROM erp_receipt_vouchers WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'السند غير موجود'; END IF;
  IF NOT erp_has_branch_access(v.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v.status = 'posted' THEN RAISE EXCEPTION 'تم ترحيل السند بالفعل'; END IF;
  IF v.status = 'cancelled' THEN RAISE EXCEPTION 'السند ملغي'; END IF;

  SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = '1100' AND is_system = true;
  IF v_cash IS NULL THEN RAISE EXCEPTION 'حساب النقدية غير موجود'; END IF;

  INSERT INTO erp_journal_entries (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
  VALUES (erp_next_number(v.branch_id, 'journal'), v.voucher_date, 'سند قبض ' || v.voucher_number || ' - ' || v.payer,
          'receipt_voucher', p_id, v.branch_id, 'posted', v_uid, v_uid, now())
  RETURNING id INTO v_entry_id;
  INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
    (v_entry_id, v_cash, v.amount, 0),
    (v_entry_id, v.account_id, 0, v.amount);

  UPDATE erp_receipt_vouchers SET status = 'posted', approved_by = v_uid WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
