-- ============================================================================
-- 0291 — Multi-branch stock visibility (pharmacy)
-- ----------------------------------------------------------------------------
-- Per-product on-hand across every branch of the tenant, so an owner sees where
-- stock sits and can rebalance via transfers (the existing erp_transfer_orders /
-- erp_complete_transfer pipeline). Returns one row per (product, branch); the UI
-- pivots into a matrix. Search-first; otherwise the busiest products. Tenant-
-- scoped. Safe to re-run.
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_pharmacy_branch_stock(p_query text DEFAULT NULL, p_limit int DEFAULT 80)
RETURNS TABLE (product_id uuid, code text, name text, name_ar text,
               branch_id uuid, branch_name text, branch_name_ar text, on_hand numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id(); q text := btrim(coalesce(p_query, ''));
BEGIN
  IF co IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH prods AS (
    SELECT p.id, p.code, p.name, p.name_ar,
      COALESCE((SELECT sum(s.quantity) FROM erp_inventory_stock s
        JOIN erp_warehouses w ON w.id=s.warehouse_id JOIN erp_branches b ON b.id=w.branch_id
        WHERE s.product_id=p.id AND b.company_id=co), 0) AS total_qty
    FROM erp_products_catalog p
    WHERE p.company_id=co AND p.is_active
      AND (q = '' OR p.name ILIKE '%'||q||'%' OR COALESCE(p.name_ar,'') ILIKE '%'||q||'%' OR p.code ILIKE q||'%' OR p.barcode = q)
    ORDER BY (CASE WHEN q='' THEN 0 ELSE 1 END), total_qty DESC, p.name
    LIMIT GREATEST(1, LEAST(p_limit, 300))
  )
  SELECT pr.id, pr.code, pr.name, pr.name_ar,
         b.id, b.name, b.name_ar,
         COALESCE((SELECT sum(s.quantity) FROM erp_inventory_stock s
           JOIN erp_warehouses w ON w.id=s.warehouse_id
           WHERE s.warehouse_id=w.id AND w.branch_id=b.id AND s.product_id=pr.id), 0)
  FROM prods pr
  CROSS JOIN erp_branches b
  WHERE b.company_id=co AND b.is_active
  ORDER BY pr.name, b.code;
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_branch_stock(text, int) TO authenticated, service_role;
