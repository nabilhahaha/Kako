-- ============================================================================
-- 0168: Safe product delete / archive
-- ----------------------------------------------------------------------------
-- A product is only HARD-deletable when it has zero stock AND no transactional
-- history. Otherwise it must be ARCHIVED (deactivated) so historical invoices,
-- returns, exchanges, movements and counts stay intact. Two additive RPCs:
--
--   * erp_product_delete_check(id) → { can_delete, reasons[] }  (UI pre-check)
--   * erp_delete_product(id)       → re-checks then deletes, or RAISES the
--                                     blocking reason; audited (product.deleted)
--
-- ADDITIVE, no schema change, no new FK. Reuses erp_user_company_id(),
-- erp_log_audit(). Delete is guarded so it can never orphan or rewrite history.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_product_delete_check(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id();
  v_reasons TEXT[] := ARRAY[]::TEXT[];
  v_stock NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM erp_products_catalog WHERE id = p_id AND (company_id = v_co OR erp_is_platform_owner())) THEN
    RETURN jsonb_build_object('can_delete', false, 'reasons', to_jsonb(ARRAY['not_found']));
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_stock FROM erp_inventory_stock WHERE product_id = p_id;
  IF v_stock <> 0 THEN v_reasons := array_append(v_reasons, 'stock'); END IF;
  IF EXISTS (SELECT 1 FROM erp_invoice_lines WHERE product_id = p_id) THEN v_reasons := array_append(v_reasons, 'invoices'); END IF;
  IF EXISTS (SELECT 1 FROM erp_sales_return_lines WHERE product_id = p_id) THEN v_reasons := array_append(v_reasons, 'returns'); END IF;
  IF EXISTS (SELECT 1 FROM erp_fashion_exchanges WHERE returned_product_id = p_id OR new_product_id = p_id) THEN v_reasons := array_append(v_reasons, 'exchanges'); END IF;
  IF EXISTS (SELECT 1 FROM erp_stock_movements WHERE product_id = p_id) THEN v_reasons := array_append(v_reasons, 'movements'); END IF;
  IF EXISTS (SELECT 1 FROM erp_stock_count_lines WHERE product_id = p_id) THEN v_reasons := array_append(v_reasons, 'counts'); END IF;
  IF EXISTS (SELECT 1 FROM erp_stock_adjustments WHERE product_id = p_id) THEN v_reasons := array_append(v_reasons, 'adjustments'); END IF;

  RETURN jsonb_build_object('can_delete', (array_length(v_reasons, 1) IS NULL), 'reasons', to_jsonb(v_reasons), 'stock', v_stock);
END $$;
REVOKE ALL ON FUNCTION erp_product_delete_check(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_product_delete_check(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION erp_delete_product(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co   UUID := erp_user_company_id();
  v_chk  JSONB;
  v_prod RECORD;
BEGIN
  SELECT id, code, name, company_id INTO v_prod FROM erp_products_catalog WHERE id = p_id FOR UPDATE;
  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود.'; END IF;
  IF NOT (erp_is_platform_owner() OR v_prod.company_id = v_co) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;

  v_chk := erp_product_delete_check(p_id);
  IF NOT (v_chk->>'can_delete')::boolean THEN
    RAISE EXCEPTION 'لا يمكن حذف الصنف لارتباطه بسجلات (%). يمكنك أرشفته بدلاً من الحذف.', (v_chk->>'reasons');
  END IF;

  -- Audit BEFORE the row disappears (preserve the trail).
  PERFORM erp_log_audit('product.deleted', 'erp_products_catalog', p_id::text,
    jsonb_build_object('code', v_prod.code, 'name', v_prod.name), v_prod.company_id);

  -- Safe: no stock, no history. Zero-qty inventory rows / variant sidecar cascade.
  DELETE FROM erp_products_catalog WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION erp_delete_product(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_delete_product(UUID) TO authenticated, service_role;
