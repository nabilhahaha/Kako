-- ============================================================================
-- 0169: Detailed product delete-block reasons (exact counts)
-- ----------------------------------------------------------------------------
-- Refines erp_product_delete_check to return the EXACT dependency counts (stock
-- units, # invoices, # returns, # exchanges, # movements, # counts, # adjustments)
-- so the UI can tell the user precisely why a delete is blocked and archive is
-- required. ADDITIVE: CREATE OR REPLACE only; same name; keeps `can_delete` and a
-- `reasons` array for back-compat and adds a `details` object.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_product_delete_check(p_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co UUID := erp_user_company_id();
  v_reasons TEXT[] := ARRAY[]::TEXT[];
  v_stock NUMERIC;
  v_invoices INT; v_returns INT; v_exchanges INT; v_movements INT; v_counts INT; v_adjustments INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM erp_products_catalog WHERE id = p_id AND (company_id = v_co OR erp_is_platform_owner())) THEN
    RETURN jsonb_build_object('can_delete', false, 'reasons', to_jsonb(ARRAY['not_found']), 'details', '{}'::jsonb);
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_stock FROM erp_inventory_stock WHERE product_id = p_id;
  SELECT count(DISTINCT invoice_id) INTO v_invoices FROM erp_invoice_lines WHERE product_id = p_id;
  SELECT count(DISTINCT return_id) INTO v_returns FROM erp_sales_return_lines WHERE product_id = p_id;
  SELECT count(*) INTO v_exchanges FROM erp_fashion_exchanges WHERE returned_product_id = p_id OR new_product_id = p_id;
  SELECT count(*) INTO v_movements FROM erp_stock_movements WHERE product_id = p_id;
  SELECT count(DISTINCT count_id) INTO v_counts FROM erp_stock_count_lines WHERE product_id = p_id;
  SELECT count(*) INTO v_adjustments FROM erp_stock_adjustments WHERE product_id = p_id;

  IF v_stock <> 0 THEN v_reasons := array_append(v_reasons, 'stock'); END IF;
  IF v_invoices > 0 THEN v_reasons := array_append(v_reasons, 'invoices'); END IF;
  IF v_returns > 0 THEN v_reasons := array_append(v_reasons, 'returns'); END IF;
  IF v_exchanges > 0 THEN v_reasons := array_append(v_reasons, 'exchanges'); END IF;
  IF v_movements > 0 THEN v_reasons := array_append(v_reasons, 'movements'); END IF;
  IF v_counts > 0 THEN v_reasons := array_append(v_reasons, 'counts'); END IF;
  IF v_adjustments > 0 THEN v_reasons := array_append(v_reasons, 'adjustments'); END IF;

  RETURN jsonb_build_object(
    'can_delete', (array_length(v_reasons, 1) IS NULL),
    'reasons', to_jsonb(v_reasons),
    'details', jsonb_build_object(
      'stock', v_stock, 'invoices', v_invoices, 'returns', v_returns, 'exchanges', v_exchanges,
      'movements', v_movements, 'counts', v_counts, 'adjustments', v_adjustments
    )
  );
END $$;
REVOKE ALL ON FUNCTION erp_product_delete_check(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_product_delete_check(UUID) TO authenticated, service_role;
