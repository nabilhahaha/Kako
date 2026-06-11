-- ============================================================================
-- 0280 — erp_pharmacy_reports: consolidated pharmacy reports (RLS-scoped)
-- ----------------------------------------------------------------------------
-- One call returns the data-heavy reports for the Reports centre: daily sales,
-- sales by medicine, inventory balance, low stock, dead stock, returns and the
-- gross-profit estimate. Expiry (expired/near) reuses erp_expiry_risk; batch
-- movement + cash session reuse their own screens. Tenant-scoped.
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_pharmacy_reports(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id(); d0 date := current_date - GREATEST(p_days, 1); res jsonb;
BEGIN
  IF co IS NULL THEN RETURN '{}'::jsonb; END IF;
  WITH inv AS (
    SELECT i.id, i.invoice_number, i.net_amount, i.created_at
    FROM erp_invoices i JOIN erp_branches b ON b.id = i.branch_id
    WHERE b.company_id = co AND i.status IN ('issued','paid','partially_paid','overdue')
      AND i.created_at >= d0
  ),
  daily AS (
    SELECT created_at::date d, sum(net_amount) total, count(*) n
    FROM inv GROUP BY created_at::date ORDER BY created_at::date DESC
  ),
  bymed AS (
    SELECT p.name, p.name_ar, sum(il.quantity) qty,
           sum(il.line_total) revenue,
           sum((il.unit_price*(1-COALESCE(il.discount_pct,0)/100.0) - COALESCE(p.cost_price,0))*il.quantity) gp
    FROM erp_invoice_lines il JOIN inv i ON i.id = il.invoice_id
    JOIN erp_products_catalog p ON p.id = il.product_id
    GROUP BY p.name, p.name_ar ORDER BY sum(il.quantity) DESC LIMIT 100
  ),
  stockq AS (
    SELECT p.id, p.name, p.name_ar, p.code, p.min_stock, p.cost_price, p.base_uom,
           COALESCE(sum(s.quantity), 0) qty
    FROM erp_products_catalog p
    LEFT JOIN erp_inventory_stock s ON s.product_id = p.id
    WHERE p.company_id = co AND p.is_active
    GROUP BY p.id
  ),
  balance AS (
    SELECT name, name_ar, code, base_uom, qty, round(qty * COALESCE(cost_price,0), 2) value
    FROM stockq WHERE qty > 0 ORDER BY qty * COALESCE(cost_price,0) DESC LIMIT 100
  ),
  low AS (
    SELECT name, name_ar, code, qty, min_stock FROM stockq
    WHERE min_stock > 0 AND qty <= min_stock ORDER BY qty LIMIT 100
  ),
  dead AS (
    SELECT sq.name, sq.name_ar, sq.code, sq.qty FROM stockq sq
    WHERE sq.qty > 0 AND NOT EXISTS (
      SELECT 1 FROM erp_stock_movements m
      WHERE m.product_id = sq.id AND m.movement_type = 'sale_out' AND m.created_at >= current_date - 60
    ) ORDER BY sq.qty DESC LIMIT 100
  ),
  rets AS (
    SELECT r.return_number, r.total_amount, r.status, r.created_at::date d,
           c.name cust, c.name_ar cust_ar
    FROM erp_sales_returns r JOIN erp_branches b ON b.id = r.branch_id
    LEFT JOIN erp_customers c ON c.id = r.customer_id
    WHERE b.company_id = co AND r.created_at >= d0 ORDER BY r.created_at DESC LIMIT 100
  )
  SELECT jsonb_build_object(
    'gross_profit', (SELECT COALESCE(sum(gp),0) FROM bymed),
    'period_sales', (SELECT COALESCE(sum(net_amount),0) FROM inv),
    'daily_sales', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date',d,'total',total,'count',n)),'[]') FROM daily),
    'by_medicine', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'name_ar',name_ar,'qty',qty,'revenue',revenue,'gp',gp)),'[]') FROM bymed),
    'inventory_balance', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'name_ar',name_ar,'code',code,'uom',base_uom,'qty',qty,'value',value)),'[]') FROM balance),
    'low_stock', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'name_ar',name_ar,'code',code,'qty',qty,'min',min_stock)),'[]') FROM low),
    'dead_stock', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'name_ar',name_ar,'code',code,'qty',qty)),'[]') FROM dead),
    'returns', (SELECT COALESCE(jsonb_agg(jsonb_build_object('number',return_number,'amount',total_amount,'status',status,'date',d,'customer',COALESCE(cust_ar,cust))),'[]') FROM rets)
  ) INTO res;
  RETURN res;
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_reports(int) TO authenticated, service_role;
