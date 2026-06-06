-- ============================================================================
-- 0165: Void Invoice — manager-only, audited reversal of an ISSUED sale
-- ----------------------------------------------------------------------------
-- Adds a safe void for an issued (but UNPAID, un-returned) invoice that reverses
-- its stock, AR/Revenue journal, customer balance, and any unpaid installment
-- plan — without deleting anything. The original invoice row is preserved and
-- flipped to 'cancelled' with a mandatory reason + actor + timestamp.
--
-- Settled (paid) or already-returned invoices are intentionally BLOCKED here:
-- those are reversed through the returns/refund workflow, not a void.
--
-- ADDITIVE + idempotent. New permission `sales.void` is seeded to the same roles
-- that already approve stock requests (the manager tier) so void stays
-- manager-only. Reuses erp_has_branch_access(), erp_log_audit(), erp_next_number()
-- and the existing chart-of-accounts (AR 1200 / Revenue 4100).
-- ============================================================================

-- ── void bookkeeping columns (additive) ─────────────────────────────────────
ALTER TABLE erp_invoices
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by   UUID,
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;

-- ── permission seed: sales.void → manager tier (proxy: stock_request.approve) ─
INSERT INTO erp_role_permissions (role_key, permission)
SELECT DISTINCT role_key, 'sales.void'
FROM erp_role_permissions
WHERE permission = 'stock_request.approve'
ON CONFLICT (role_key, permission) DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT DISTINCT company_id, role_key, 'sales.void'
FROM erp_company_role_permissions
WHERE permission = 'stock_request.approve'
ON CONFLICT (company_id, role_key, permission) DO NOTHING;

-- ── RPC: void an issued invoice ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_void_invoice(p_invoice_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv       erp_invoices;
  v_uid       UUID := auth.uid();
  v_ar        UUID;
  v_rev       UUID;
  v_entry     UUID;
  v_plan      erp_installment_plans;
  v_inst_paid NUMERIC;
  v_company   UUID;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'سبب الإبطال مطلوب.';
  END IF;

  SELECT * INTO v_inv FROM erp_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF NOT erp_has_branch_access(v_inv.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'الفاتورة ملغاة بالفعل.'; END IF;
  IF v_inv.status = 'draft' THEN RAISE EXCEPTION 'استخدم إلغاء المسودة للفواتير غير المُصدرة.'; END IF;

  -- SAFETY: never void something already settled or returned — reverse those via
  -- the returns/refund workflow so cash/AR stay consistent.
  IF COALESCE(v_inv.paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'لا يمكن إبطال فاتورة مدفوعة (كلياً أو جزئياً). استخدم المرتجع/الاسترداد.';
  END IF;
  IF EXISTS (SELECT 1 FROM erp_sales_returns WHERE invoice_id = p_invoice_id AND status = 'completed') THEN
    RAISE EXCEPTION 'لا يمكن إبطال فاتورة لها مرتجع معتمد.';
  END IF;

  SELECT * INTO v_plan FROM erp_installment_plans WHERE invoice_id = p_invoice_id;
  IF FOUND THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_inst_paid FROM erp_installment_payments WHERE plan_id = v_plan.id;
    IF v_inst_paid > 0 THEN RAISE EXCEPTION 'لا يمكن إبطال فاتورة لها أقساط محصّلة.'; END IF;
  END IF;

  -- 1) Reverse stock — restock exactly what was issued, into the same warehouse,
  --    by inverting the original sale_out movements for this invoice.
  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'return_in', m.warehouse_id, m.product_id, -m.quantity, 'invoice_void', p_invoice_id,
         'إبطال فاتورة: ' || v_inv.invoice_number, v_uid
  FROM erp_stock_movements m
  WHERE m.reference_type = 'invoice' AND m.reference_id = p_invoice_id AND m.movement_type = 'sale_out';

  -- 2) Reverse the AR/Revenue journal (debit Revenue, credit AR — the mirror of issue).
  IF v_inv.net_amount <> 0 THEN
    SELECT id INTO v_ar  FROM erp_chart_of_accounts WHERE code = '1200' AND is_system = true LIMIT 1;
    SELECT id INTO v_rev FROM erp_chart_of_accounts WHERE code = '4100' AND is_system = true LIMIT 1;
    IF v_ar IS NOT NULL AND v_rev IS NOT NULL THEN
      INSERT INTO erp_journal_entries (entry_number, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_inv.branch_id, 'journal'), 'إبطال فاتورة ' || v_inv.invoice_number,
              'invoice_void', p_invoice_id, v_inv.branch_id, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES
        (v_entry, v_rev, v_inv.net_amount, 0, 'عكس إيراد ' || v_inv.invoice_number),
        (v_entry, v_ar, 0, v_inv.net_amount, 'عكس مدينون ' || v_inv.invoice_number);
    END IF;
  END IF;

  -- 3) Reverse the customer receivable (issue added net_amount; paid_amount is 0 here).
  UPDATE erp_customers SET balance = balance - v_inv.net_amount WHERE id = v_inv.customer_id;

  -- 4) Cancel an unpaid installment plan tied to this invoice.
  IF v_plan.id IS NOT NULL THEN
    UPDATE erp_installment_plans SET status = 'cancelled' WHERE id = v_plan.id;
  END IF;

  -- 5) Preserve the invoice — flip to cancelled with the void trail (no delete).
  UPDATE erp_invoices
     SET status = 'cancelled', void_reason = btrim(p_reason), voided_by = v_uid, voided_at = now()
   WHERE id = p_invoice_id;

  SELECT company_id INTO v_company FROM erp_branches WHERE id = v_inv.branch_id;
  PERFORM erp_log_audit('invoice.voided', 'erp_invoices', p_invoice_id::text,
    jsonb_build_object('invoice_number', v_inv.invoice_number, 'net_amount', v_inv.net_amount, 'reason', btrim(p_reason)),
    v_company);
END $$;

REVOKE ALL ON FUNCTION erp_void_invoice(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_void_invoice(UUID, TEXT) TO authenticated, service_role;
