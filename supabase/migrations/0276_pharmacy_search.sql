-- ============================================================================
-- 0276 — erp_pharmacy_search: fast multi-field POS search (tenant-scoped)
-- ----------------------------------------------------------------------------
-- One call powers the POS search box and barcode scan: exact barcode / code
-- prefix / trigram fuzzy on English + Arabic trade name + active ingredient.
-- Returns price, tax, on-hand stock and batch count so the terminal can render
-- and validate instantly. Uses the trigram GIN indexes from 0274. Tenant-scoped
-- via erp_user_company_id(); SECURITY DEFINER for a stable plan.
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_pharmacy_search(p_query text, p_limit int DEFAULT 30)
RETURNS TABLE (
  product_id uuid, code text, name text, name_ar text, barcode text,
  sell_price numeric, tax_rate numeric, active_ingredient text,
  on_hand numeric, batch_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid := erp_user_company_id(); v_q text := btrim(coalesce(p_query, ''));
BEGIN
  IF v_co IS NULL OR length(v_q) < 1 THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.code, p.name, p.name_ar, p.barcode, p.sell_price, p.tax_rate,
         COALESCE(r.active_ingredient, p.description) AS active_ingredient,
         COALESCE((
           SELECT sum(s.quantity) FROM erp_inventory_stock s
           JOIN erp_warehouses w ON w.id = s.warehouse_id
           JOIN erp_branches b ON b.id = w.branch_id
           WHERE s.product_id = p.id AND b.company_id = v_co
         ), 0) AS on_hand,
         (SELECT count(*)::int FROM erp_product_batches bt
            WHERE bt.product_id = p.id AND bt.qty_on_hand > 0) AS batch_count
  FROM erp_products_catalog p
  LEFT JOIN erp_clinic_reference r ON r.id = p.medicine_ref_id
  WHERE p.company_id = v_co AND p.is_active
    AND (
      p.barcode = v_q
      OR p.code ILIKE v_q || '%'
      OR p.name ILIKE '%' || v_q || '%'
      OR COALESCE(p.name_ar, '') ILIKE '%' || v_q || '%'
      OR COALESCE(r.active_ingredient, '') ILIKE '%' || v_q || '%'
      OR COALESCE(p.description, '') ILIKE '%' || v_q || '%'
    )
  ORDER BY
    (p.barcode = v_q) DESC,
    (p.code ILIKE v_q || '%') DESC,
    (p.name ILIKE v_q || '%' OR COALESCE(p.name_ar,'') ILIKE v_q || '%') DESC,
    p.name
  LIMIT GREATEST(1, LEAST(p_limit, 50));
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_search(text, int) TO authenticated, service_role;
