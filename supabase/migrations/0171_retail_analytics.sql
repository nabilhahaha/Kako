-- ============================================================================
-- 0171: Retail analytics + operational alerts (read-only aggregate RPC)
-- ----------------------------------------------------------------------------
-- One company-scoped, SECURITY DEFINER function that returns the retail
-- dashboard payload (KPIs + alerts + top lists) in a single round-trip. Pure
-- read; no writes, no schema change beyond this function. Company isolation is
-- enforced by joining erp_branches.company_id = erp_user_company_id().
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_retail_analytics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co            uuid := erp_user_company_id();
  v_today         date := current_date;
  v_month         date := date_trunc('month', current_date)::date;
  v_sales_today   numeric;
  v_sales_month   numeric;
  v_gross         numeric;
  v_installment   numeric;
  v_cash          numeric;
  v_returns       numeric;
  v_purchases     numeric;
  v_collected     numeric;
  v_scheduled     numeric;
  v_low           int;
  v_out           int;
  v_due_today     int;
  v_overdue       int;
  v_neg_box       numeric;
  v_slow          int;
  v_high_ret      int;
  v_top_products  jsonb;
  v_top_customers jsonb;
  v_slow_list     jsonb;
  v_high_list     jsonb;
BEGIN
  IF v_co IS NULL THEN RETURN '{}'::jsonb; END IF;

  -- KPIs (issued, non-cancelled invoices) ------------------------------------
  SELECT COALESCE(SUM(inv.net_amount),0) INTO v_sales_today
  FROM erp_invoices inv JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co
  WHERE inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_today;

  SELECT COALESCE(SUM(inv.net_amount),0) INTO v_sales_month
  FROM erp_invoices inv JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co
  WHERE inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_month;

  SELECT COALESCE(SUM((il.unit_price - COALESCE(p.cost_price,0)) * il.quantity),0) INTO v_gross
  FROM erp_invoice_lines il
  JOIN erp_invoices inv ON inv.id=il.invoice_id AND inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_month
  JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co
  JOIN erp_products_catalog p ON p.id=il.product_id;

  SELECT
    COALESCE(SUM(net_amount) FILTER (WHERE has_plan),0),
    COALESCE(SUM(net_amount) FILTER (WHERE NOT has_plan),0)
  INTO v_installment, v_cash
  FROM (
    SELECT inv.net_amount, EXISTS(SELECT 1 FROM erp_installment_plans ip WHERE ip.invoice_id=inv.id) AS has_plan
    FROM erp_invoices inv JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co
    WHERE inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_month
  ) q;

  SELECT COALESCE(SUM(sr.total_amount),0) INTO v_returns
  FROM erp_sales_returns sr JOIN erp_branches b ON b.id=sr.branch_id AND b.company_id=v_co
  WHERE sr.status='completed' AND sr.created_at >= v_month;

  SELECT COALESCE(SUM(po.net_amount),0) INTO v_purchases
  FROM erp_purchase_orders po JOIN erp_branches b ON b.id=po.branch_id AND b.company_id=v_co
  WHERE po.status='received' AND po.updated_at >= v_month;

  SELECT COALESCE(SUM(ip.amount),0) INTO v_collected
  FROM erp_installment_payments ip WHERE ip.company_id=v_co AND ip.paid_at >= v_month;
  SELECT COALESCE(SUM(s.amount),0) INTO v_scheduled
  FROM erp_installment_schedule s WHERE s.company_id=v_co AND s.due_date >= v_month AND s.due_date <= v_today;

  -- Alerts -------------------------------------------------------------------
  WITH oh AS (
    SELECT s.product_id, SUM(s.quantity) qty
    FROM erp_inventory_stock s
    JOIN erp_warehouses w ON w.id=s.warehouse_id
    JOIN erp_branches b ON b.id=w.branch_id AND b.company_id=v_co
    GROUP BY s.product_id
  )
  SELECT
    count(*) FILTER (WHERE oh.qty > 0 AND p.min_stock > 0 AND oh.qty <= p.min_stock),
    count(*) FILTER (WHERE oh.qty <= 0)
  INTO v_low, v_out
  FROM erp_products_catalog p
  JOIN oh ON oh.product_id = p.id
  WHERE p.company_id=v_co AND p.is_active;

  SELECT count(*) INTO v_due_today FROM erp_installment_schedule s WHERE s.company_id=v_co AND s.due_date=v_today AND s.status<>'paid';
  SELECT count(*) INTO v_overdue FROM erp_installment_schedule s WHERE s.company_id=v_co AND s.due_date<v_today AND s.status<>'paid';

  SELECT COALESCE(SUM(bal) FILTER (WHERE bal < 0),0) INTO v_neg_box FROM (
    SELECT cs.opening_float + COALESCE(SUM(CASE WHEN cm.kind IN ('sale','collection','payin') THEN cm.amount ELSE -cm.amount END),0) AS bal
    FROM erp_cash_sessions cs
    LEFT JOIN erp_cash_movements cm ON cm.session_id=cs.id
    WHERE cs.company_id=v_co AND cs.status='open'
    GROUP BY cs.id, cs.opening_float
  ) s;

  -- products with stock but no sale_out in 30 days
  WITH oh AS (
    SELECT s.product_id, SUM(s.quantity) qty FROM erp_inventory_stock s
    JOIN erp_warehouses w ON w.id=s.warehouse_id JOIN erp_branches b ON b.id=w.branch_id AND b.company_id=v_co
    GROUP BY s.product_id
  )
  SELECT count(*) INTO v_slow FROM erp_products_catalog p
  JOIN oh ON oh.product_id=p.id
  WHERE p.company_id=v_co AND p.is_active AND oh.qty > 0
    AND NOT EXISTS (SELECT 1 FROM erp_stock_movements m WHERE m.product_id=p.id AND m.movement_type='sale_out' AND m.created_at >= v_today - 30);

  -- products with high return ratio over 90 days (>=20% of sold qty, sold>0)
  WITH sold AS (
    SELECT il.product_id, SUM(il.quantity) q FROM erp_invoice_lines il
    JOIN erp_invoices inv ON inv.id=il.invoice_id AND inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_today - 90
    JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co GROUP BY il.product_id
  ), ret AS (
    SELECT rl.product_id, SUM(rl.quantity) q FROM erp_sales_return_lines rl
    JOIN erp_sales_returns sr ON sr.id=rl.return_id AND sr.status='completed' AND sr.created_at >= v_today - 90
    JOIN erp_branches b ON b.id=sr.branch_id AND b.company_id=v_co GROUP BY rl.product_id
  )
  SELECT count(*) INTO v_high_ret FROM sold s JOIN ret r ON r.product_id=s.product_id WHERE s.q > 0 AND r.q::numeric / s.q >= 0.2;

  -- Top lists ----------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(x ORDER BY x.revenue DESC),'[]'::jsonb) INTO v_top_products FROM (
    SELECT COALESCE(p.name_ar, p.name) AS name, SUM(il.quantity) AS qty, SUM(il.line_total) AS revenue
    FROM erp_invoice_lines il
    JOIN erp_invoices inv ON inv.id=il.invoice_id AND inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_month
    JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co
    JOIN erp_products_catalog p ON p.id=il.product_id
    GROUP BY p.id, COALESCE(p.name_ar, p.name) ORDER BY revenue DESC LIMIT 5
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.revenue DESC),'[]'::jsonb) INTO v_top_customers FROM (
    SELECT COALESCE(c.name_ar, c.name) AS name, SUM(inv.net_amount) AS revenue
    FROM erp_invoices inv
    JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co
    JOIN erp_customers c ON c.id=inv.customer_id
    WHERE inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_month AND c.code <> 'WALKIN'
    GROUP BY c.id, COALESCE(c.name_ar, c.name) ORDER BY revenue DESC LIMIT 5
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.qty DESC),'[]'::jsonb) INTO v_slow_list FROM (
    WITH oh AS (
      SELECT s.product_id, SUM(s.quantity) qty FROM erp_inventory_stock s
      JOIN erp_warehouses w ON w.id=s.warehouse_id JOIN erp_branches b ON b.id=w.branch_id AND b.company_id=v_co GROUP BY s.product_id
    )
    SELECT COALESCE(p.name_ar, p.name) AS name, oh.qty
    FROM erp_products_catalog p JOIN oh ON oh.product_id=p.id
    WHERE p.company_id=v_co AND p.is_active AND oh.qty > 0
      AND NOT EXISTS (SELECT 1 FROM erp_stock_movements m WHERE m.product_id=p.id AND m.movement_type='sale_out' AND m.created_at >= v_today - 30)
    ORDER BY oh.qty DESC LIMIT 5
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.ratio DESC),'[]'::jsonb) INTO v_high_list FROM (
    WITH sold AS (
      SELECT il.product_id, SUM(il.quantity) q FROM erp_invoice_lines il
      JOIN erp_invoices inv ON inv.id=il.invoice_id AND inv.status NOT IN ('draft','cancelled') AND inv.created_at >= v_today - 90
      JOIN erp_branches b ON b.id=inv.branch_id AND b.company_id=v_co GROUP BY il.product_id
    ), ret AS (
      SELECT rl.product_id, SUM(rl.quantity) q FROM erp_sales_return_lines rl
      JOIN erp_sales_returns sr ON sr.id=rl.return_id AND sr.status='completed' AND sr.created_at >= v_today - 90
      JOIN erp_branches b ON b.id=sr.branch_id AND b.company_id=v_co GROUP BY rl.product_id
    )
    SELECT COALESCE(p.name_ar, p.name) AS name, round((r.q::numeric / s.q) * 100, 1) AS ratio
    FROM sold s JOIN ret r ON r.product_id=s.product_id JOIN erp_products_catalog p ON p.id=s.product_id
    WHERE s.q > 0 AND r.q::numeric / s.q >= 0.2 ORDER BY ratio DESC LIMIT 5
  ) x;

  RETURN jsonb_build_object(
    'sales_today', v_sales_today,
    'sales_month', v_sales_month,
    'gross_profit', v_gross,
    'installment_sales', v_installment,
    'cash_sales', v_cash,
    'returns_month', v_returns,
    'return_rate', CASE WHEN v_sales_month > 0 THEN round(v_returns / v_sales_month * 100, 1) ELSE 0 END,
    'purchases_month', v_purchases,
    'collected_month', v_collected,
    'collection_rate', CASE WHEN v_scheduled > 0 THEN round(v_collected / v_scheduled * 100, 1) ELSE 0 END,
    'alerts', jsonb_build_object(
      'low_stock', v_low, 'out_of_stock', v_out, 'due_today', v_due_today,
      'overdue', v_overdue, 'negative_cashbox', v_neg_box, 'slow_moving', v_slow, 'high_returns', v_high_ret
    ),
    'top_products', v_top_products,
    'top_customers', v_top_customers,
    'slow_moving', v_slow_list,
    'high_returns', v_high_list
  );
END $$;
REVOKE ALL ON FUNCTION erp_retail_analytics() FROM public;
GRANT EXECUTE ON FUNCTION erp_retail_analytics() TO authenticated, service_role;
