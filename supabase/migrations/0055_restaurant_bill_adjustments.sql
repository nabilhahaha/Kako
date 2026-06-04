-- ============================================================================
-- 0055: Restaurant bill — discount, service charge, VAT, payment method
-- ----------------------------------------------------------------------------
-- Extends an order with a discount (amount or %), a service-charge %, a VAT %,
-- and the payment method captured at checkout. erp_close_restaurant_order now
-- computes subtotal − discount + delivery + service + tax, and debits Cash
-- (1100) or Bank (1120) by the chosen method. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_restaurant_orders
  ADD COLUMN IF NOT EXISTS discount_type  TEXT NOT NULL DEFAULT 'amount',  -- amount | percent
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_rate   NUMERIC NOT NULL DEFAULT 0,      -- %
  ADD COLUMN IF NOT EXISTS tax_rate       NUMERIC NOT NULL DEFAULT 0,      -- %
  ADD COLUMN IF NOT EXISTS payment_method TEXT;                            -- cash | card

DROP FUNCTION IF EXISTS erp_close_restaurant_order(UUID);

CREATE OR REPLACE FUNCTION erp_close_restaurant_order(p_order_id UUID, p_payment_method TEXT DEFAULT 'cash')
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID; v_branch UUID; v_table UUID; v_status TEXT;
  v_delivery NUMERIC; v_dtype TEXT; v_dval NUMERIC; v_srate NUMERIC; v_trate NUMERIC;
  v_subtotal NUMERIC; v_discount NUMERIC; v_base NUMERIC; v_service NUMERIC; v_tax NUMERIC; v_total NUMERIC;
  v_method TEXT := CASE WHEN p_payment_method = 'card' THEN 'card' ELSE 'cash' END;
  v_cash UUID; v_rev UUID; v_entry UUID; v_uid UUID := auth.uid();
BEGIN
  SELECT company_id, branch_id, table_id, status, COALESCE(delivery_fee,0),
         COALESCE(discount_type,'amount'), COALESCE(discount_value,0), COALESCE(service_rate,0), COALESCE(tax_rate,0)
    INTO v_company, v_branch, v_table, v_status, v_delivery, v_dtype, v_dval, v_srate, v_trate
    FROM erp_restaurant_orders WHERE id = p_order_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'الأوردر غير موجود.'; END IF;
  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'تم إغلاق الأوردر بالفعل.'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'الأوردر ملغي.'; END IF;

  SELECT COALESCE(SUM(qty * price), 0) INTO v_subtotal FROM erp_restaurant_order_items WHERE order_id = p_order_id;
  v_discount := CASE WHEN v_dtype = 'percent' THEN round(v_subtotal * v_dval / 100, 2) ELSE LEAST(v_dval, v_subtotal) END;
  v_base := GREATEST(v_subtotal - v_discount + v_delivery, 0);
  v_service := round(v_base * v_srate / 100, 2);
  v_tax := round((v_base + v_service) * v_trate / 100, 2);
  v_total := v_base + v_service + v_tax;

  UPDATE erp_restaurant_orders
     SET status = 'closed', total = v_total, payment_method = v_method, closed_at = now()
   WHERE id = p_order_id;

  IF v_table IS NOT NULL THEN UPDATE erp_restaurant_tables SET status = 'free' WHERE id = v_table; END IF;

  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM erp_branches WHERE company_id = v_company AND is_active ORDER BY code LIMIT 1;
  END IF;
  IF v_branch IS NOT NULL AND v_total > 0 THEN
    SELECT id INTO v_cash FROM erp_chart_of_accounts
      WHERE code = CASE WHEN v_method = 'card' THEN '1120' ELSE '1100' END AND is_system LIMIT 1;
    SELECT id INTO v_rev FROM erp_chart_of_accounts WHERE code = '4100' AND is_system LIMIT 1;
    IF v_cash IS NOT NULL AND v_rev IS NOT NULL THEN
      INSERT INTO erp_journal_entries
        (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES
        (erp_next_number(v_branch, 'journal'), CURRENT_DATE, 'مبيعات مطعم/كافيه',
         'restaurant_order', p_order_id, v_branch, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
        (v_entry, v_cash, v_total, 0),
        (v_entry, v_rev, 0, v_total);
    END IF;
  END IF;

  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION erp_close_restaurant_order(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_close_restaurant_order(UUID, TEXT) TO authenticated;
