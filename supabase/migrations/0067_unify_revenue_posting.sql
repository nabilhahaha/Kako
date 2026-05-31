-- ============================================================================
-- 0067: Unify revenue posting — one helper + a per-company account map
-- ----------------------------------------------------------------------------
-- The clinic/restaurant/salon/laundry checkout functions each hand-rolled the
-- same journal posting with hardcoded account codes. Consolidate into ONE
-- helper, erp_post_revenue(), which resolves the cash/bank and revenue accounts
-- from a per-company account map (erp_account_map), falling back to the system
-- chart (Cash 1100 / Bank 1120 / Sales 4100 / Services 4200). Behaviour is
-- identical when the map is empty; the map makes the accounts configurable.
-- Safe to re-run.
-- ============================================================================

-- Optional per-company override of which account a posting hits.
CREATE TABLE IF NOT EXISTS erp_account_map (
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  account_key  TEXT NOT NULL,   -- cash | bank | revenue_sales | revenue_services
  account_code TEXT NOT NULL,
  PRIMARY KEY (company_id, account_key)
);
ALTER TABLE erp_account_map ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_account_map_set_company ON erp_account_map;
CREATE TRIGGER erp_account_map_set_company BEFORE INSERT ON erp_account_map
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP POLICY IF EXISTS "erp_account_map_tenant" ON erp_account_map;
CREATE POLICY "erp_account_map_tenant" ON erp_account_map FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- The single posting helper. Internal only (no GRANT to authenticated): it is
-- called from the SECURITY DEFINER checkout functions, which already authorize
-- the caller. Posts Debit cash/bank / Credit revenue. Returns the entry id.
CREATE OR REPLACE FUNCTION erp_post_revenue(
  p_company_id UUID, p_branch_id UUID, p_amount NUMERIC, p_method TEXT,
  p_revenue_key TEXT, p_ref_type TEXT, p_ref_id UUID, p_description TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_branch UUID := p_branch_id;
  v_cash UUID; v_rev UUID; v_entry UUID; v_uid UUID := auth.uid();
  v_cash_code TEXT; v_rev_code TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN NULL; END IF;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM erp_branches WHERE company_id = p_company_id AND is_active ORDER BY code LIMIT 1;
  END IF;
  IF v_branch IS NULL THEN RETURN NULL; END IF;

  v_cash_code := COALESCE(
    (SELECT account_code FROM erp_account_map WHERE company_id = p_company_id AND account_key = CASE WHEN p_method = 'card' THEN 'bank' ELSE 'cash' END),
    CASE WHEN p_method = 'card' THEN '1120' ELSE '1100' END);
  v_rev_code := COALESCE(
    (SELECT account_code FROM erp_account_map WHERE company_id = p_company_id AND account_key = p_revenue_key),
    CASE WHEN p_revenue_key = 'revenue_sales' THEN '4100' ELSE '4200' END);

  SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = v_cash_code LIMIT 1;
  SELECT id INTO v_rev  FROM erp_chart_of_accounts WHERE code = v_rev_code LIMIT 1;
  IF v_cash IS NULL OR v_rev IS NULL THEN RETURN NULL; END IF;

  INSERT INTO erp_journal_entries
    (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
  VALUES
    (erp_next_number(v_branch, 'journal'), CURRENT_DATE, p_description, p_ref_type, p_ref_id, v_branch, 'posted', v_uid, v_uid, now())
  RETURNING id INTO v_entry;
  INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
    (v_entry, v_cash, p_amount, 0),
    (v_entry, v_rev, 0, p_amount);
  RETURN v_entry;
END $$;
REVOKE ALL ON FUNCTION erp_post_revenue(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, UUID, TEXT) FROM public;

-- ── Refactor the four checkout functions to use the helper ──────────────────

CREATE OR REPLACE FUNCTION erp_collect_clinic_fee(p_visit_id UUID, p_amount NUMERIC)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_company UUID; v_branch UUID; v_patient TEXT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ غير صحيح.'; END IF;
  SELECT cv.company_id, cv.branch_id, p.name INTO v_company, v_branch, v_patient
    FROM erp_clinic_visits cv LEFT JOIN erp_patients p ON p.id = cv.patient_id WHERE cv.id = p_visit_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'الكشف غير موجود.'; END IF;
  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  UPDATE erp_clinic_visits SET paid_amount = COALESCE(paid_amount, 0) + p_amount WHERE id = p_visit_id;
  PERFORM erp_post_revenue(v_company, v_branch, p_amount, 'cash', 'revenue_services', 'clinic_payment', p_visit_id, 'تحصيل كشف عيادة - ' || COALESCE(v_patient, ''));
END $$;

CREATE OR REPLACE FUNCTION erp_close_restaurant_order(p_order_id UUID, p_payment_method TEXT DEFAULT 'cash')
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID; v_branch UUID; v_table UUID; v_status TEXT;
  v_delivery NUMERIC; v_dtype TEXT; v_dval NUMERIC; v_srate NUMERIC; v_trate NUMERIC;
  v_subtotal NUMERIC; v_discount NUMERIC; v_base NUMERIC; v_service NUMERIC; v_tax NUMERIC; v_total NUMERIC;
  v_method TEXT := CASE WHEN p_payment_method = 'card' THEN 'card' ELSE 'cash' END;
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
  UPDATE erp_restaurant_orders SET status='closed', total=v_total, payment_method=v_method, closed_at=now() WHERE id=p_order_id;
  IF v_table IS NOT NULL THEN UPDATE erp_restaurant_tables SET status='free' WHERE id=v_table; END IF;
  PERFORM erp_post_revenue(v_company, v_branch, v_total, v_method, 'revenue_sales', 'restaurant_order', p_order_id, 'مبيعات مطعم/كافيه');
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION erp_close_salon_ticket(p_ticket_id UUID, p_payment_method TEXT DEFAULT 'cash')
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID; v_branch UUID; v_status TEXT; v_disc NUMERIC; v_sub NUMERIC; v_total NUMERIC;
  v_method TEXT := CASE WHEN p_payment_method = 'card' THEN 'card' ELSE 'cash' END;
BEGIN
  SELECT company_id, branch_id, status, COALESCE(discount_value,0)
    INTO v_company, v_branch, v_status, v_disc FROM erp_salon_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'التذكرة غير موجودة.'; END IF;
  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'تم إغلاق التذكرة بالفعل.'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'التذكرة ملغاة.'; END IF;
  SELECT COALESCE(SUM(qty * price), 0) INTO v_sub FROM erp_salon_ticket_items WHERE ticket_id = p_ticket_id;
  v_total := GREATEST(v_sub - LEAST(v_disc, v_sub), 0);
  UPDATE erp_salon_tickets SET status='closed', total=v_total, payment_method=v_method, closed_at=now() WHERE id=p_ticket_id;
  PERFORM erp_post_revenue(v_company, v_branch, v_total, v_method, 'revenue_services', 'salon_ticket', p_ticket_id, 'مبيعات صالون');
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION erp_close_laundry_order(p_order_id UUID, p_payment_method TEXT DEFAULT 'cash')
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID; v_branch UUID; v_status TEXT; v_delivery NUMERIC; v_disc NUMERIC;
  v_sub NUMERIC; v_total NUMERIC; v_method TEXT := CASE WHEN p_payment_method = 'card' THEN 'card' ELSE 'cash' END;
BEGIN
  SELECT company_id, branch_id, status, COALESCE(delivery_fee,0), COALESCE(discount_value,0)
    INTO v_company, v_branch, v_status, v_delivery, v_disc FROM erp_laundry_orders WHERE id = p_order_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود.'; END IF;
  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF v_status = 'delivered' THEN RAISE EXCEPTION 'تم تسليم الطلب بالفعل.'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'الطلب ملغي.'; END IF;
  SELECT COALESCE(SUM(qty * price), 0) INTO v_sub FROM erp_laundry_order_items WHERE order_id = p_order_id;
  v_total := GREATEST(v_sub - LEAST(v_disc, v_sub) + v_delivery, 0);
  UPDATE erp_laundry_orders SET status='delivered', total=v_total, payment_method=v_method, delivered_at=now() WHERE id=p_order_id;
  PERFORM erp_post_revenue(v_company, v_branch, v_total, v_method, 'revenue_services', 'laundry_order', p_order_id, 'مبيعات مغسلة');
  RETURN v_total;
END $$;
