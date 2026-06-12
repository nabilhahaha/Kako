-- ============================================================================
-- 0283 — erp_pharmacy_alternatives: generic/substitute medicines
-- ----------------------------------------------------------------------------
-- For a tenant product, find OTHER in-catalogue medicines that share the same
-- active ingredient (the generic/substitute set) — for "out of X → offer an
-- equivalent" at the POS. Returns trade name, manufacturer, dosage form,
-- strength, price and on-hand. Ordered: same dosage form first, then in-stock,
-- then cheapest. Tenant-scoped.
-- ============================================================================
DROP FUNCTION IF EXISTS erp_pharmacy_alternatives(uuid, integer);
CREATE OR REPLACE FUNCTION erp_pharmacy_alternatives(p_product uuid, p_limit int DEFAULT 12)
RETURNS TABLE (product_id uuid, code text, name text, name_ar text, barcode text,
               sell_price numeric, active_ingredient text, manufacturer text, form text, strength text, on_hand numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid := erp_user_company_id(); v_ai text; v_form text;
BEGIN
  IF v_co IS NULL THEN RETURN; END IF;
  SELECT lower(btrim(COALESCE(p.description, r.active_ingredient))), lower(btrim(r.form))
    INTO v_ai, v_form
  FROM erp_products_catalog p
  LEFT JOIN erp_clinic_reference r ON r.id = p.medicine_ref_id
  WHERE p.id = p_product AND p.company_id = v_co;
  IF v_ai IS NULL OR v_ai = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT p2.id, p2.code, p2.name, p2.name_ar, p2.barcode, p2.sell_price,
         COALESCE(p2.description, r2.active_ingredient) AS active_ingredient,
         r2.manufacturer, r2.form, r2.strength,
         COALESCE((
           SELECT sum(s.quantity) FROM erp_inventory_stock s
           JOIN erp_warehouses w ON w.id = s.warehouse_id
           JOIN erp_branches b ON b.id = w.branch_id
           WHERE s.product_id = p2.id AND b.company_id = v_co), 0) AS on_hand
  FROM erp_products_catalog p2
  LEFT JOIN erp_clinic_reference r2 ON r2.id = p2.medicine_ref_id
  WHERE p2.company_id = v_co AND p2.is_active AND p2.id <> p_product
    AND lower(btrim(COALESCE(p2.description, r2.active_ingredient))) = v_ai
  ORDER BY (lower(btrim(r2.form)) IS NOT DISTINCT FROM v_form) DESC,
           (COALESCE((SELECT sum(s.quantity) FROM erp_inventory_stock s
              JOIN erp_warehouses w ON w.id=s.warehouse_id JOIN erp_branches b ON b.id=w.branch_id
              WHERE s.product_id=p2.id AND b.company_id=v_co),0) > 0) DESC,
           p2.sell_price ASC
  LIMIT GREATEST(1, LEAST(p_limit, 30));
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_alternatives(uuid, int) TO authenticated, service_role;
