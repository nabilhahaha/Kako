-- ============================================================================
-- 0284 — erp_pharmacy_reorder_suggestions: low-stock → suggested purchase
-- ----------------------------------------------------------------------------
-- Drives the Reorder workflow: products at/below their min stock, with a
-- suggested order quantity (top up to 2× min), the last cost, and the preferred
-- supplier (most recent batch's supplier). Feeds Purchase Order creation. Reuses
-- the existing erp_purchase_orders / _lines tables. Tenant-scoped.
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_pharmacy_reorder_suggestions()
RETURNS TABLE (product_id uuid, code text, name text, name_ar text,
               on_hand numeric, min_stock numeric, suggested_qty numeric,
               last_cost numeric, supplier_id uuid, supplier_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id();
BEGIN
  IF co IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH stock AS (
    SELECT p.id, p.code, p.name, p.name_ar, p.min_stock, p.cost_price,
      COALESCE((SELECT sum(s.quantity) FROM erp_inventory_stock s
        JOIN erp_warehouses w ON w.id=s.warehouse_id JOIN erp_branches b ON b.id=w.branch_id
        WHERE s.product_id=p.id AND b.company_id=co), 0) AS oh
    FROM erp_products_catalog p
    WHERE p.company_id=co AND p.is_active AND p.min_stock>0
  ),
  sup AS (
    SELECT DISTINCT ON (bt.product_id) bt.product_id, bt.supplier_id
    FROM erp_product_batches bt
    WHERE bt.company_id=co AND bt.supplier_id IS NOT NULL
    ORDER BY bt.product_id, bt.received_at DESC
  )
  SELECT st.id, st.code, st.name, st.name_ar, st.oh, st.min_stock,
         GREATEST(1, ceil(st.min_stock*2 - st.oh))::numeric AS suggested_qty,
         st.cost_price, sup.supplier_id, s.name
  FROM stock st
  LEFT JOIN sup ON sup.product_id = st.id
  LEFT JOIN erp_suppliers s ON s.id = sup.supplier_id
  WHERE st.oh <= st.min_stock
  ORDER BY (st.min_stock - st.oh) DESC
  LIMIT 200;
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_reorder_suggestions() TO authenticated, service_role;
