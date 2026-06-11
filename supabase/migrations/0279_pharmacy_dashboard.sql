-- ============================================================================
-- 0279 — erp_pharmacy_dashboard: owner KPIs in one RLS-scoped call
-- ----------------------------------------------------------------------------
-- Daily sales, cash, GP estimate, low stock, near/expired, returns, adjustments,
-- top medicines, sales by user — computed server-side for the pharmacy owner
-- dashboard. Tenant-scoped via erp_user_company_id().
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_pharmacy_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id(); today date := current_date; res jsonb;
BEGIN
  IF co IS NULL THEN RETURN '{}'::jsonb; END IF;
  WITH inv AS (
    SELECT i.id, i.net_amount, i.created_by, i.created_at
    FROM erp_invoices i JOIN erp_branches b ON b.id = i.branch_id
    WHERE b.company_id = co AND i.status IN ('issued','paid','partially_paid','overdue')
  ),
  today_inv AS (SELECT * FROM inv WHERE created_at::date = today),
  gp AS (
    SELECT COALESCE(sum((il.unit_price * (1 - COALESCE(il.discount_pct,0)/100.0) - COALESCE(p.cost_price,0)) * il.quantity), 0) g
    FROM today_inv ti JOIN erp_invoice_lines il ON il.invoice_id = ti.id
    JOIN erp_products_catalog p ON p.id = il.product_id
  ),
  cash AS (
    SELECT COALESCE(sum(pay.amount), 0) c FROM erp_payments pay
    JOIN inv i ON i.id = pay.invoice_id
    WHERE pay.payment_method = 'cash' AND pay.payment_date::date = today
  ),
  low AS (
    SELECT count(*) n FROM (
      SELECT p.id
      FROM erp_products_catalog p
      LEFT JOIN erp_inventory_stock s ON s.product_id = p.id
      WHERE p.company_id = co AND p.is_active AND p.min_stock > 0
      GROUP BY p.id, p.min_stock
      HAVING COALESCE(sum(s.quantity), 0) <= p.min_stock
    ) x
  ),
  exp AS (
    SELECT count(*) FILTER (WHERE bucket = 'expired') expired,
           count(*) FILTER (WHERE bucket IN ('d30','d60','d90')) near
    FROM erp_expiry_risk WHERE company_id = co
  ),
  ret AS (
    SELECT count(*) n FROM erp_sales_returns r JOIN erp_branches b ON b.id = r.branch_id
    WHERE b.company_id = co AND r.created_at::date = today
  ),
  adj AS (
    SELECT count(*) n FROM erp_stock_movements m
    JOIN erp_warehouses w ON w.id = m.warehouse_id JOIN erp_branches b ON b.id = w.branch_id
    WHERE b.company_id = co AND m.movement_type = 'adjustment' AND m.created_at::date = today
  ),
  topmeds AS (
    SELECT p.name, p.name_ar, sum(il.quantity) q
    FROM erp_invoice_lines il JOIN inv i ON i.id = il.invoice_id
    JOIN erp_products_catalog p ON p.id = il.product_id
    WHERE i.created_at >= today - 30
    GROUP BY p.name, p.name_ar ORDER BY sum(il.quantity) DESC LIMIT 5
  ),
  byuser AS (
    SELECT COALESCE(pr.full_name, pr.email, 'user') u, sum(ti.net_amount) total
    FROM today_inv ti LEFT JOIN erp_profiles pr ON pr.id = ti.created_by
    GROUP BY pr.full_name, pr.email ORDER BY sum(ti.net_amount) DESC LIMIT 8
  )
  SELECT jsonb_build_object(
    'today_sales', (SELECT COALESCE(sum(net_amount),0) FROM today_inv),
    'today_invoices', (SELECT count(*) FROM today_inv),
    'today_cash', (SELECT c FROM cash),
    'gp_estimate', (SELECT g FROM gp),
    'low_stock', (SELECT n FROM low),
    'expired', (SELECT expired FROM exp),
    'near_expiry', (SELECT near FROM exp),
    'returns_today', (SELECT n FROM ret),
    'adjustments_today', (SELECT n FROM adj),
    'top_meds', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'name_ar',name_ar,'qty',q)),'[]') FROM topmeds),
    'sales_by_user', (SELECT COALESCE(jsonb_agg(jsonb_build_object('user',u,'total',total)),'[]') FROM byuser)
  ) INTO res;
  RETURN res;
END $$;

GRANT EXECUTE ON FUNCTION erp_pharmacy_dashboard() TO authenticated, service_role;
