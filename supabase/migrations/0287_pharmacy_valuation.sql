-- ============================================================================
-- 0287 — Pharmacy inventory valuation (FIFO / Moving Average)
-- ----------------------------------------------------------------------------
-- Value on-hand stock by a chosen costing method. on_hand is the authoritative
-- inventory ledger (erp_inventory_stock). The unit cost is method-derived:
--   • fifo        → weighted cost of the CURRENT batch layers (what is physically
--                   left, at its actual receipt cost); falls back to cost_price.
--   • moving_avg  → average purchase cost across all purchase_in movements; falls
--                   back to cost_price.
-- total_value = on_hand × unit_cost. Tenant-scoped, read-only. Safe to re-run.
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_pharmacy_inventory_valuation(p_method text DEFAULT 'fifo')
RETURNS TABLE (product_id uuid, code text, name text, name_ar text,
               on_hand numeric, unit_cost numeric, total_value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id();
        method text := lower(coalesce(p_method, 'fifo'));
BEGIN
  IF co IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH oh AS (
    SELECT p.id, p.code, p.name, p.name_ar, p.cost_price,
      COALESCE((SELECT sum(s.quantity) FROM erp_inventory_stock s
        JOIN erp_warehouses w ON w.id=s.warehouse_id JOIN erp_branches b ON b.id=w.branch_id
        WHERE s.product_id=p.id AND b.company_id=co), 0) AS qty
    FROM erp_products_catalog p
    WHERE p.company_id=co AND p.is_active
  ),
  fifo AS (
    SELECT bt.product_id,
      CASE WHEN sum(bt.qty_on_hand) > 0
           THEN sum(bt.qty_on_hand * COALESCE(bt.cost_price,0)) / sum(bt.qty_on_hand)
           ELSE NULL END AS unit
    FROM erp_product_batches bt
    WHERE bt.company_id=co AND bt.qty_on_hand > 0
    GROUP BY bt.product_id
  ),
  mavg AS (
    SELECT m.product_id,
      CASE WHEN sum(m.quantity) > 0
           THEN sum(COALESCE(m.total_cost, m.unit_cost*m.quantity, 0)) / sum(m.quantity)
           ELSE NULL END AS unit
    FROM erp_stock_movements m
    JOIN erp_warehouses w ON w.id=m.warehouse_id JOIN erp_branches b ON b.id=w.branch_id
    WHERE b.company_id=co AND m.movement_type='purchase_in' AND m.quantity > 0
    GROUP BY m.product_id
  )
  SELECT oh.id, oh.code, oh.name, oh.name_ar, oh.qty,
         uc.unit_cost,
         round((oh.qty * uc.unit_cost)::numeric, 2) AS total_value
  FROM oh
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      CASE WHEN method = 'moving_avg' THEN (SELECT unit FROM mavg WHERE mavg.product_id = oh.id)
           ELSE (SELECT unit FROM fifo WHERE fifo.product_id = oh.id) END,
      oh.cost_price, 0) AS unit_cost
  ) uc
  WHERE oh.qty <> 0
  ORDER BY (oh.qty * uc.unit_cost) DESC
  LIMIT 1000;
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_inventory_valuation(text) TO authenticated, service_role;
