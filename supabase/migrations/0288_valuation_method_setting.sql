-- ============================================================================
-- 0288 — Tenant inventory valuation method (the official costing basis)
-- ----------------------------------------------------------------------------
-- The valuation method (FIFO / Moving Average) is a TENANT setting, not a report
-- toggle — it is the official accounting basis used consistently for inventory
-- valuation, COGS, gross profit, inventory reports and dashboards. A report may
-- still show the other method for comparison, but the stored setting is the
-- source of truth.
--
--   • erp_inventory_settings(company_id, valuation_method) — the stored setting.
--   • erp_company_valuation_method() — resolves the tenant's official method.
--   • erp_product_cost(product, method) — method-aware unit cost (FIFO = current
--     batch layers; Moving Average = average purchase cost; falls back to
--     cost_price). The single costing primitive shared by every consumer.
--
-- Rewires erp_pharmacy_inventory_valuation, erp_pharmacy_reports (GP + inventory
-- balance) and erp_pharmacy_dashboard (GP) onto the official method. Safe re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_inventory_settings (
  company_id uuid PRIMARY KEY REFERENCES erp_companies(id) ON DELETE CASCADE,
  valuation_method text NOT NULL DEFAULT 'fifo' CHECK (valuation_method IN ('fifo','moving_avg')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE erp_inventory_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_inventory_settings_tenant ON erp_inventory_settings;
CREATE POLICY erp_inventory_settings_tenant ON erp_inventory_settings
  FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Resolver: the tenant's official method (default FIFO when unset).
CREATE OR REPLACE FUNCTION erp_company_valuation_method()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT valuation_method FROM erp_inventory_settings WHERE company_id = erp_user_company_id()),
    'fifo');
$$;
GRANT EXECUTE ON FUNCTION erp_company_valuation_method() TO authenticated, service_role;

-- Method-aware per-product unit cost. product_id uniquely identifies the tenant,
-- so it is the scoping key. FIFO uses the current batch layers' weighted cost
-- (what is physically on hand at its receipt cost); Moving Average uses the
-- average purchase cost across purchase_in movements; both fall back to cost_price.
CREATE OR REPLACE FUNCTION erp_product_cost(p_product uuid, p_method text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    CASE WHEN lower(coalesce(p_method,'fifo')) = 'moving_avg' THEN
      (SELECT sum(COALESCE(m.total_cost, m.unit_cost*m.quantity, 0)) / NULLIF(sum(m.quantity),0)
       FROM erp_stock_movements m
       WHERE m.product_id = p_product AND m.movement_type = 'purchase_in' AND m.quantity > 0)
    ELSE
      (SELECT sum(bt.qty_on_hand * COALESCE(bt.cost_price,0)) / NULLIF(sum(bt.qty_on_hand),0)
       FROM erp_product_batches bt WHERE bt.product_id = p_product AND bt.qty_on_hand > 0)
    END,
    (SELECT cost_price FROM erp_products_catalog WHERE id = p_product),
    0);
$$;
GRANT EXECUTE ON FUNCTION erp_product_cost(uuid, text) TO authenticated, service_role;

-- ── Valuation — official method when p_method is null/'official'; explicit method
--    ('fifo' | 'moving_avg') for side-by-side comparison. ────────────────────────
CREATE OR REPLACE FUNCTION erp_pharmacy_inventory_valuation(p_method text DEFAULT NULL)
RETURNS TABLE (product_id uuid, code text, name text, name_ar text,
               on_hand numeric, unit_cost numeric, total_value numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id();
        method text := CASE WHEN p_method IS NULL OR lower(p_method) = 'official'
                            THEN erp_company_valuation_method() ELSE lower(p_method) END;
BEGIN
  IF co IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH oh AS (
    SELECT p.id, p.code, p.name, p.name_ar,
      COALESCE((SELECT sum(s.quantity) FROM erp_inventory_stock s
        JOIN erp_warehouses w ON w.id=s.warehouse_id JOIN erp_branches b ON b.id=w.branch_id
        WHERE s.product_id=p.id AND b.company_id=co), 0) AS qty
    FROM erp_products_catalog p
    WHERE p.company_id=co AND p.is_active
  )
  SELECT oh.id, oh.code, oh.name, oh.name_ar, oh.qty,
         erp_product_cost(oh.id, method) AS unit_cost,
         round((oh.qty * erp_product_cost(oh.id, method))::numeric, 2) AS total_value
  FROM oh
  WHERE oh.qty <> 0
  ORDER BY (oh.qty * erp_product_cost(oh.id, method)) DESC
  LIMIT 1000;
END $$;
GRANT EXECUTE ON FUNCTION erp_pharmacy_inventory_valuation(text) TO authenticated, service_role;

-- ── Reports — GP (COGS) and inventory balance value on the official method. ──────
CREATE OR REPLACE FUNCTION erp_pharmacy_reports(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id(); d0 date := current_date - GREATEST(p_days, 1);
        m text := erp_company_valuation_method(); res jsonb;
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
           sum((il.unit_price*(1-COALESCE(il.discount_pct,0)/100.0) - erp_product_cost(p.id, m))*il.quantity) gp
    FROM erp_invoice_lines il JOIN inv i ON i.id = il.invoice_id
    JOIN erp_products_catalog p ON p.id = il.product_id
    GROUP BY p.id, p.name, p.name_ar ORDER BY sum(il.quantity) DESC LIMIT 100
  ),
  stockq AS (
    SELECT p.id, p.name, p.name_ar, p.code, p.min_stock, p.base_uom,
           erp_product_cost(p.id, m) costu,
           COALESCE(sum(s.quantity), 0) qty
    FROM erp_products_catalog p
    LEFT JOIN erp_inventory_stock s ON s.product_id = p.id
    WHERE p.company_id = co AND p.is_active
    GROUP BY p.id
  ),
  balance AS (
    SELECT name, name_ar, code, base_uom, qty, round(qty * COALESCE(costu,0), 2) value
    FROM stockq WHERE qty > 0 ORDER BY qty * COALESCE(costu,0) DESC LIMIT 100
  ),
  low AS (
    SELECT name, name_ar, code, qty, min_stock FROM stockq
    WHERE min_stock > 0 AND qty <= min_stock ORDER BY qty LIMIT 100
  ),
  dead AS (
    SELECT sq.name, sq.name_ar, sq.code, sq.qty FROM stockq sq
    WHERE sq.qty > 0 AND NOT EXISTS (
      SELECT 1 FROM erp_stock_movements mm
      WHERE mm.product_id = sq.id AND mm.movement_type = 'sale_out' AND mm.created_at >= current_date - 60
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
    'valuation_method', m,
    'gross_profit', (SELECT COALESCE(sum(gp),0) FROM bymed),
    'period_sales', (SELECT COALESCE(sum(net_amount),0) FROM inv),
    'inventory_value', (SELECT COALESCE(sum(value),0) FROM balance),
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

-- ── Dashboard — GP estimate on the official method. ─────────────────────────────
CREATE OR REPLACE FUNCTION erp_pharmacy_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE co uuid := erp_user_company_id(); today date := current_date;
        m text := erp_company_valuation_method(); res jsonb;
BEGIN
  IF co IS NULL THEN RETURN '{}'::jsonb; END IF;
  WITH inv AS (
    SELECT i.id, i.net_amount, i.created_by, i.created_at
    FROM erp_invoices i JOIN erp_branches b ON b.id = i.branch_id
    WHERE b.company_id = co AND i.status IN ('issued','paid','partially_paid','overdue')
  ),
  today_inv AS (SELECT * FROM inv WHERE created_at::date = today),
  gp AS (
    SELECT COALESCE(sum((il.unit_price * (1 - COALESCE(il.discount_pct,0)/100.0) - erp_product_cost(p.id, m)) * il.quantity), 0) g
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
    SELECT count(*) n FROM erp_stock_movements mm
    JOIN erp_warehouses w ON w.id = mm.warehouse_id JOIN erp_branches b ON b.id = w.branch_id
    WHERE b.company_id = co AND mm.movement_type = 'adjustment' AND mm.created_at::date = today
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
    'valuation_method', m,
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
