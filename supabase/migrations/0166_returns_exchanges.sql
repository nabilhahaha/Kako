-- ============================================================================
-- 0166: Returns & Exchanges — invoice link, double-return guard, refund method,
--       and a single-workflow exchange
-- ----------------------------------------------------------------------------
-- Builds ON TOP of the existing sales-returns feature (erp_sales_returns /
-- _lines / erp_complete_sales_return) — no rebuild, no destructive change:
--   * refund_method on the return (credit = reduce AR / cash = pay out of the box)
--   * a completion RPC that (a) blocks returning more than was sold on the linked
--     invoice and (b) refunds cash OR credit accordingly, fully journalled
--   * an exchange RPC over the existing erp_fashion_exchanges table: restock the
--     returned item, sell the replacement, settle the price difference, audited
--
-- ADDITIVE + idempotent. NO new foreign key (so the schema-health covering-index
-- invariant is unaffected). Reuses erp_has_branch_access(), erp_log_audit(),
-- erp_next_number(), the chart of accounts (SR 4110 / AR 1200 / Cash 1110), and
-- the cash box (erp_cash_sessions / erp_cash_movements). Every effect is a
-- standard reversible movement / balance change and is audited.
-- ============================================================================

-- ── refund method on the return (additive, no FK) ───────────────────────────
ALTER TABLE erp_sales_returns
  ADD COLUMN IF NOT EXISTS refund_method TEXT NOT NULL DEFAULT 'credit';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_sales_returns_refund_method_chk') THEN
    ALTER TABLE erp_sales_returns
      ADD CONSTRAINT erp_sales_returns_refund_method_chk CHECK (refund_method IN ('credit','cash'));
  END IF;
END $$;

-- ── helper: returnable quantity per product for an invoice ────────────────────
-- sold on the invoice minus already-returned on COMPLETED returns linked to it.
CREATE OR REPLACE FUNCTION erp_invoice_returnable(p_invoice_id UUID)
RETURNS TABLE (product_id UUID, sold_qty NUMERIC, returned_qty NUMERIC, returnable_qty NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT il.product_id,
         SUM(il.quantity) AS sold_qty,
         COALESCE(r.returned_qty, 0) AS returned_qty,
         GREATEST(SUM(il.quantity) - COALESCE(r.returned_qty, 0), 0) AS returnable_qty
  FROM erp_invoice_lines il
  LEFT JOIN (
    SELECT rl.product_id, SUM(rl.quantity) AS returned_qty
    FROM erp_sales_return_lines rl
    JOIN erp_sales_returns sr ON sr.id = rl.return_id
    WHERE sr.invoice_id = p_invoice_id AND sr.status = 'completed'
    GROUP BY rl.product_id
  ) r ON r.product_id = il.product_id
  WHERE il.invoice_id = p_invoice_id
  GROUP BY il.product_id, r.returned_qty;
$$;
REVOKE ALL ON FUNCTION erp_invoice_returnable(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_invoice_returnable(UUID) TO authenticated, service_role;

-- ── complete a return with a double-return guard + refund method ─────────────
CREATE OR REPLACE FUNCTION erp_complete_sales_return_ex(p_return_id UUID, p_refund_method TEXT DEFAULT 'credit')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ret    erp_sales_returns;
  v_uid    UUID := auth.uid();
  v_wh     UUID;
  v_sr     UUID;
  v_ar     UUID;
  v_cash   UUID;
  v_entry  UUID;
  v_method TEXT := CASE WHEN p_refund_method = 'cash' THEN 'cash' ELSE 'credit' END;
  v_company UUID;
  v_sess   UUID;
  v_bad    RECORD;
BEGIN
  SELECT * INTO v_ret FROM erp_sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المرتجع غير موجود'; END IF;
  IF NOT erp_has_branch_access(v_ret.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_ret.status = 'completed' THEN RAISE EXCEPTION 'تم اعتماد هذا المرتجع بالفعل'; END IF;
  IF v_ret.status = 'cancelled' THEN RAISE EXCEPTION 'المرتجع ملغي'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_sales_return_lines WHERE return_id = p_return_id) THEN
    RAISE EXCEPTION 'المرتجع بلا بنود';
  END IF;

  -- Double-return guard: only when the return is linked to an invoice. Block if
  -- any line would push the cumulative returned qty above what was sold.
  IF v_ret.invoice_id IS NOT NULL THEN
    SELECT rl.product_id INTO v_bad
    FROM erp_sales_return_lines rl
    JOIN (SELECT product_id, returnable_qty FROM erp_invoice_returnable(v_ret.invoice_id)) av
      ON av.product_id = rl.product_id
    WHERE rl.return_id = p_return_id
    GROUP BY rl.product_id, av.returnable_qty
    HAVING SUM(rl.quantity) > av.returnable_qty
    LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'الكمية المرتجعة تتجاوز الكمية المباعة المتاحة للإرجاع.'; END IF;
    -- A product not on the invoice at all cannot be returned against it.
    IF EXISTS (
      SELECT 1 FROM erp_sales_return_lines rl
      WHERE rl.return_id = p_return_id
        AND NOT EXISTS (SELECT 1 FROM erp_invoice_lines il WHERE il.invoice_id = v_ret.invoice_id AND il.product_id = rl.product_id)
    ) THEN RAISE EXCEPTION 'صنف غير موجود في الفاتورة الأصلية.'; END IF;
  END IF;

  -- 1) Restock (return_in).
  SELECT id INTO v_wh FROM erp_warehouses
    WHERE branch_id = v_ret.branch_id AND is_active = true ORDER BY code LIMIT 1;
  IF v_wh IS NOT NULL THEN
    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    SELECT 'return_in', v_wh, l.product_id, abs(l.quantity), 'sales_return', p_return_id, 'مرتجع: ' || v_ret.return_number, v_uid
    FROM erp_sales_return_lines l WHERE l.return_id = p_return_id;
  END IF;

  -- 2) Accounting + settlement.
  IF v_ret.total_amount > 0 THEN
    SELECT id INTO v_sr FROM erp_chart_of_accounts WHERE code = '4110' AND is_system = true LIMIT 1;
    SELECT id INTO v_ar FROM erp_chart_of_accounts WHERE code = '1200' AND is_system = true LIMIT 1;
    SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = '1110' AND is_system = true LIMIT 1;
    IF v_sr IS NOT NULL THEN
      INSERT INTO erp_journal_entries (entry_number, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_ret.branch_id, 'journal'), 'مرتجع مبيعات ' || v_ret.return_number,
              'sales_return', p_return_id, v_ret.branch_id, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry;
      IF v_method = 'cash' AND v_cash IS NOT NULL THEN
        -- Cash refund: Dr Sales Returns / Cr Cash. Customer AR untouched.
        INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES
          (v_entry, v_sr, v_ret.total_amount, 0, 'مرتجع ' || v_ret.return_number),
          (v_entry, v_cash, 0, v_ret.total_amount, 'استرداد نقدي ' || v_ret.return_number);
        -- Cash box payout in the branch's open session (if any).
        SELECT id INTO v_sess FROM erp_cash_sessions
          WHERE branch_id = v_ret.branch_id AND status = 'open' LIMIT 1;
        IF v_sess IS NOT NULL THEN
          INSERT INTO erp_cash_movements (session_id, kind, amount, reference_type, reference_id, note, created_by)
          VALUES (v_sess, 'payout', v_ret.total_amount, 'sales_return', p_return_id, 'استرداد مرتجع ' || v_ret.return_number, v_uid);
        END IF;
      ELSIF v_ar IS NOT NULL THEN
        -- Credit refund: Dr Sales Returns / Cr AR, and lower the customer balance.
        INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES
          (v_entry, v_sr, v_ret.total_amount, 0, 'مرتجع ' || v_ret.return_number),
          (v_entry, v_ar, 0, v_ret.total_amount, 'مرتجع ' || v_ret.return_number);
        UPDATE erp_customers SET balance = balance - v_ret.total_amount WHERE id = v_ret.customer_id;
      END IF;
    END IF;
  END IF;

  UPDATE erp_sales_returns
     SET status = 'completed', approved_by = v_uid, refund_method = v_method
   WHERE id = p_return_id;

  SELECT company_id INTO v_company FROM erp_branches WHERE id = v_ret.branch_id;
  PERFORM erp_log_audit('sales_return.completed', 'erp_sales_returns', p_return_id::text,
    jsonb_build_object('return_number', v_ret.return_number, 'total', v_ret.total_amount,
                       'refund_method', v_method, 'invoice_id', v_ret.invoice_id), v_company);
END $$;
REVOKE ALL ON FUNCTION erp_complete_sales_return_ex(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_complete_sales_return_ex(UUID, TEXT) TO authenticated, service_role;

-- ── exchange: return an item and sell a replacement in one audited workflow ──
CREATE OR REPLACE FUNCTION erp_post_exchange(
  p_invoice_id         UUID,
  p_returned_product_id UUID,
  p_return_qty         NUMERIC,
  p_new_product_id     UUID,
  p_new_qty            NUMERIC,
  p_new_unit_price     NUMERIC,
  p_settle_method      TEXT DEFAULT 'cash'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv     erp_invoices;
  v_uid     UUID := auth.uid();
  v_co      UUID := erp_user_company_id();
  v_wh      UUID;
  v_old_price NUMERIC;
  v_old_val NUMERIC;
  v_new_val NUMERIC;
  v_diff    NUMERIC;
  v_returnable NUMERIC;
  v_method  TEXT := CASE WHEN p_settle_method = 'credit' THEN 'credit' ELSE 'cash' END;
  v_sess    UUID;
  v_exch    UUID;
BEGIN
  IF p_return_qty IS NULL OR p_return_qty <= 0 OR p_new_qty IS NULL OR p_new_qty <= 0 THEN
    RAISE EXCEPTION 'حدّد كميات صحيحة للاستبدال.';
  END IF;
  SELECT * INTO v_inv FROM erp_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة'; END IF;
  IF NOT erp_has_branch_access(v_inv.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'لا يمكن الاستبدال على فاتورة ملغاة.'; END IF;

  -- The returned item must have enough returnable qty on the invoice.
  SELECT returnable_qty INTO v_returnable FROM erp_invoice_returnable(p_invoice_id) WHERE product_id = p_returned_product_id;
  IF v_returnable IS NULL THEN RAISE EXCEPTION 'الصنف المرتجع غير موجود في الفاتورة الأصلية.'; END IF;
  IF p_return_qty > v_returnable THEN RAISE EXCEPTION 'كمية الاستبدال تتجاوز المتاح للإرجاع.'; END IF;

  SELECT (SUM(line_total) / NULLIF(SUM(quantity),0)) INTO v_old_price
    FROM erp_invoice_lines WHERE invoice_id = p_invoice_id AND product_id = p_returned_product_id;
  v_old_val := p_return_qty * COALESCE(v_old_price, 0);
  v_new_val := p_new_qty * COALESCE(p_new_unit_price, 0);
  v_diff := round((v_new_val - v_old_val)::numeric, 2);

  SELECT id INTO v_wh FROM erp_warehouses WHERE branch_id = v_inv.branch_id AND is_active = true ORDER BY code LIMIT 1;
  IF v_wh IS NOT NULL THEN
    -- restock the returned item
    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    VALUES ('return_in', v_wh, p_returned_product_id, abs(p_return_qty), 'exchange', p_invoice_id, 'استبدال - مرتجع', v_uid);
    -- issue the replacement item
    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    VALUES ('sale_out', v_wh, p_new_product_id, -abs(p_new_qty), 'exchange', p_invoice_id, 'استبدال - بديل', v_uid);
  END IF;

  -- Settle the price difference. diff > 0 → customer pays; diff < 0 → refund.
  SELECT id INTO v_sess FROM erp_cash_sessions WHERE branch_id = v_inv.branch_id AND status = 'open' LIMIT 1;
  IF v_diff <> 0 THEN
    IF v_method = 'cash' THEN
      IF v_sess IS NOT NULL THEN
        INSERT INTO erp_cash_movements (session_id, kind, amount, reference_type, reference_id, note, created_by)
        VALUES (v_sess, CASE WHEN v_diff > 0 THEN 'payin' ELSE 'payout' END, abs(v_diff), 'exchange', p_invoice_id, 'فرق استبدال', v_uid);
      END IF;
    ELSE
      -- to the customer's account
      UPDATE erp_customers SET balance = balance + v_diff WHERE id = v_inv.customer_id;
    END IF;
  END IF;

  INSERT INTO erp_fashion_exchanges (company_id, branch_id, original_invoice_id, returned_product_id, new_product_id, qty, price_difference, settled_method, created_by)
  VALUES (v_co, v_inv.branch_id, p_invoice_id, p_returned_product_id, p_new_product_id, p_new_qty, v_diff, v_method, v_uid)
  RETURNING id INTO v_exch;

  PERFORM erp_log_audit('exchange.posted', 'erp_fashion_exchanges', v_exch::text,
    jsonb_build_object('invoice_id', p_invoice_id, 'returned_product', p_returned_product_id, 'new_product', p_new_product_id,
                       'return_qty', p_return_qty, 'new_qty', p_new_qty, 'price_difference', v_diff, 'settle', v_method), v_co);
  RETURN jsonb_build_object('exchange_id', v_exch, 'price_difference', v_diff);
END $$;
REVOKE ALL ON FUNCTION erp_post_exchange(UUID, UUID, NUMERIC, UUID, NUMERIC, NUMERIC, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_post_exchange(UUID, UUID, NUMERIC, UUID, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
