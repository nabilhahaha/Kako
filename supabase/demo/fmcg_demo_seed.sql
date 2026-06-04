-- ============================================================================
-- FMCG Demo Seed — end-to-end showcase (regions/areas, master data, customers
-- with the S3 model, products, pilot pricing, routes, draft orders/invoices).
-- ----------------------------------------------------------------------------
-- IDEMPOTENT and scoped to a single demo tenant. Run by an operator on a DEMO
-- Supabase project (NOT a migration; CI never applies it; nothing here touches
-- production). Re-running adds only what's missing. Draft documents only — no
-- stock/GL side effects (issuing is a separate user action).
--
-- Exercises: S1 regions/areas · S3 customer master data + expanded customer
-- model · Pricing engine (base → price list → customer/segment rule) · routes.
-- Requires migrations 0101–0106 applied on the target project.
-- ============================================================================

DO $fmcg_seed$
DECLARE
  v_company UUID := '1a1dfb3b-9d5c-4a41-9e59-0dbcf3829731';  -- "VANTORA FMCG Demo" (fixed demo tenant)
  v_branch  UUID;
  v_wh      UUID;
  v_rg_cairo UUID; v_rg_delta UUID;
  v_ar_caire UUID; v_ar_cairw UUID; v_ar_tanta UUID;
  v_seg_ret UUID; v_seg_whs UUID; v_seg_key UUID; v_seg_dist UUID;
  v_ch_trad UUID; v_ch_mod UUID; v_ch_whs UUID; v_ch_hor UUID; v_ch_ecom UUID;
  v_cls_a UUID; v_cls_b UUID; v_cls_c UUID;
  v_tier_whs UUID;
  v_pl UUID;
  v_p_oil UUID; v_cust_key UUID;
BEGIN
  -- ── Company (find-or-create; triggers seed roles/modules/customer lookups) ──
  IF NOT EXISTS (SELECT 1 FROM erp_companies WHERE id = v_company) THEN
    INSERT INTO erp_companies (id, name, name_ar, business_type, currency, plan_key,
                               subscription_start, subscription_end)
    VALUES (v_company, 'VANTORA FMCG Demo', 'فانتورا للتوزيع (تجريبي)', 'wholesale', 'EGP', 'free',
            now(), now() + interval '90 days');
  END IF;
  PERFORM erp_seed_company_customer_lookups(v_company);  -- ensure segment/class/channel master data

  -- ── HQ branch ──────────────────────────────────────────────────────────────
  SELECT id INTO v_branch FROM erp_branches WHERE company_id = v_company AND code = 'HQ' LIMIT 1;
  IF v_branch IS NULL THEN
    INSERT INTO erp_branches (company_id, code, name, name_ar, city, is_hq)
    VALUES (v_company, 'HQ', 'Main Branch', 'الفرع الرئيسي', 'Cairo', true)
    RETURNING id INTO v_branch;
  END IF;

  -- ── Warehouse ──────────────────────────────────────────────────────────────
  SELECT id INTO v_wh FROM erp_warehouses WHERE branch_id = v_branch AND code = 'WH-MAIN' LIMIT 1;
  IF v_wh IS NULL THEN
    INSERT INTO erp_warehouses (branch_id, code, name, name_ar, location)
    VALUES (v_branch, 'WH-MAIN', 'Main Depot', 'المستودع الرئيسي', 'Cairo')
    RETURNING id INTO v_wh;
  END IF;

  -- ── Regions + areas (S1) ────────────────────────────────────────────────────
  INSERT INTO erp_regions (company_id, name, name_ar, sort) VALUES
    (v_company, 'Greater Cairo', 'القاهرة الكبرى', 10),
    (v_company, 'Delta', 'الدلتا', 20)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_rg_cairo FROM erp_regions WHERE company_id = v_company AND name = 'Greater Cairo';
  SELECT id INTO v_rg_delta FROM erp_regions WHERE company_id = v_company AND name = 'Delta';

  INSERT INTO erp_areas (company_id, region_id, name, name_ar, sort) VALUES
    (v_company, v_rg_cairo, 'Cairo East', 'شرق القاهرة', 10),
    (v_company, v_rg_cairo, 'Cairo West', 'غرب القاهرة', 20),
    (v_company, v_rg_delta, 'Tanta',      'طنطا',        30)
  ON CONFLICT (company_id, name) DO NOTHING;
  SELECT id INTO v_ar_caire FROM erp_areas WHERE company_id = v_company AND name = 'Cairo East';
  SELECT id INTO v_ar_cairw FROM erp_areas WHERE company_id = v_company AND name = 'Cairo West';
  SELECT id INTO v_ar_tanta FROM erp_areas WHERE company_id = v_company AND name = 'Tanta';

  UPDATE erp_branches SET region_id = v_rg_cairo, area_id = v_ar_caire
    WHERE id = v_branch AND region_id IS NULL;

  -- ── Resolve the seeded customer master data (by kind+code) ──────────────────
  SELECT id INTO v_seg_ret  FROM erp_customer_lookups WHERE company_id = v_company AND kind='segment' AND code='retail';
  SELECT id INTO v_seg_whs  FROM erp_customer_lookups WHERE company_id = v_company AND kind='segment' AND code='wholesale';
  SELECT id INTO v_seg_key  FROM erp_customer_lookups WHERE company_id = v_company AND kind='segment' AND code='key_account';
  SELECT id INTO v_seg_dist FROM erp_customer_lookups WHERE company_id = v_company AND kind='segment' AND code='distributor';
  SELECT id INTO v_ch_trad  FROM erp_customer_lookups WHERE company_id = v_company AND kind='channel' AND code='traditional';
  SELECT id INTO v_ch_mod   FROM erp_customer_lookups WHERE company_id = v_company AND kind='channel' AND code='modern';
  SELECT id INTO v_ch_whs   FROM erp_customer_lookups WHERE company_id = v_company AND kind='channel' AND code='wholesale';
  SELECT id INTO v_ch_hor   FROM erp_customer_lookups WHERE company_id = v_company AND kind='channel' AND code='horeca';
  SELECT id INTO v_ch_ecom  FROM erp_customer_lookups WHERE company_id = v_company AND kind='channel' AND code='ecommerce';
  SELECT id INTO v_cls_a    FROM erp_customer_lookups WHERE company_id = v_company AND kind='classification' AND code='a';
  SELECT id INTO v_cls_b    FROM erp_customer_lookups WHERE company_id = v_company AND kind='classification' AND code='b';
  SELECT id INTO v_cls_c    FROM erp_customer_lookups WHERE company_id = v_company AND kind='classification' AND code='c';

  -- ── Product categories + SKUs ───────────────────────────────────────────────
  INSERT INTO erp_product_categories (company_id, code, name, name_ar, sort_order) VALUES
    (v_company, 'FD-OILS',   'Cooking Oils',     'الزيوت',        10),
    (v_company, 'FD-GRAINS', 'Grains & Sugar',   'الحبوب والسكر', 20),
    (v_company, 'FD-DAIRY',  'Dairy',            'الألبان',       30),
    (v_company, 'FD-BEV',    'Beverages',        'المشروبات',     40)
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO erp_products_catalog (company_id, code, name, name_ar, unit, cost_price, sell_price, tax_rate, category_id)
  VALUES
    (v_company, 'FD-OIL1',  'Sunflower Oil 1L',  'زيت عباد الشمس 1ل', 'bottle', 38.00, 45.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-OILS')),
    (v_company, 'FD-OIL5',  'Sunflower Oil 5L',  'زيت عباد الشمس 5ل', 'jerry',  180.00, 210.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-OILS')),
    (v_company, 'FD-SUG1',  'Sugar 1kg',         'سكر 1كجم',          'bag',    22.00, 27.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-GRAINS')),
    (v_company, 'FD-RICE5', 'Rice 5kg',          'أرز 5كجم',          'bag',    120.00, 140.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-GRAINS')),
    (v_company, 'FD-FLR1',  'Flour 1kg',         'دقيق 1كجم',         'bag',    14.00, 18.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-GRAINS')),
    (v_company, 'FD-MILK1', 'UHT Milk 1L',       'لبن طويل الأجل 1ل', 'carton', 19.00, 24.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-DAIRY')),
    (v_company, 'FD-CHS',   'Cheese 500g',       'جبنة 500ج',         'pack',   42.00, 52.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-DAIRY')),
    (v_company, 'FD-WTR',   'Water 1.5L x6',     'مياه 1.5ل×6',       'pack',   24.00, 30.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-BEV')),
    (v_company, 'FD-JCE',   'Juice 1L',          'عصير 1ل',           'carton', 16.00, 21.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-BEV')),
    (v_company, 'FD-TEA',   'Black Tea 250g',    'شاي أسود 250ج',     'box',    33.00, 40.00, 14, (SELECT id FROM erp_product_categories WHERE code='FD-BEV'))
  ON CONFLICT (code) DO NOTHING;
  SELECT id INTO v_p_oil FROM erp_products_catalog WHERE company_id = v_company AND code = 'FD-OIL1';

  -- ── Wholesale tier (price group) ────────────────────────────────────────────
  INSERT INTO erp_wholesale_tiers (company_id, name, sort)
  SELECT v_company, 'Wholesale', 10
  WHERE NOT EXISTS (SELECT 1 FROM erp_wholesale_tiers WHERE company_id = v_company AND name = 'Wholesale');
  SELECT id INTO v_tier_whs FROM erp_wholesale_tiers WHERE company_id = v_company AND name = 'Wholesale';

  -- ── Default price list + items (list price = base, simple for pilot) ─────────
  INSERT INTO erp_price_lists (company_id, name, name_ar, is_default)
  SELECT v_company, 'FMCG Standard', 'قائمة الأسعار القياسية', true
  WHERE NOT EXISTS (SELECT 1 FROM erp_price_lists WHERE company_id = v_company AND name = 'FMCG Standard');
  SELECT id INTO v_pl FROM erp_price_lists WHERE company_id = v_company AND name = 'FMCG Standard';

  INSERT INTO erp_price_list_items (price_list_id, product_id, unit_price)
  SELECT v_pl, p.id, p.sell_price
  FROM erp_products_catalog p
  WHERE p.company_id = v_company AND p.code LIKE 'FD-%'
  ON CONFLICT (price_list_id, product_id) DO NOTHING;

  -- ── Customers (24) — full S3 model, varied across segment/channel/class/region ─
  INSERT INTO erp_customers
    (company_id, code, name, name_ar, branch_id, city, phone, credit_limit, payment_terms_days,
     contact_person, contact_phone, cr_number, segment_id, classification_id, channel_id,
     region_id, area_id, latitude, longitude, is_active, is_approved)
  SELECT
    v_company,
    'FD-C' || lpad(i::text, 4, '0'),
    'Demo Customer ' || i,
    'عميل تجريبي ' || i,
    v_branch,
    CASE WHEN i % 2 = 1 THEN 'Cairo' ELSE 'Tanta' END,
    '01' || lpad((100000000 + i)::text, 9, '0'),
    20000 + (i * 5000),
    (i % 3) * 15,                                   -- 0 / 15 / 30 day terms
    'Contact ' || i,
    '011' || lpad((200000000 + i)::text, 8, '0'),
    'CR-' || (100000 + i),
    (ARRAY[v_seg_ret, v_seg_whs, v_seg_key, v_seg_dist])[(i % 4) + 1],
    (ARRAY[v_cls_a, v_cls_b, v_cls_c])[(i % 3) + 1],
    (ARRAY[v_ch_trad, v_ch_mod, v_ch_whs, v_ch_hor, v_ch_ecom])[(i % 5) + 1],
    CASE WHEN i % 2 = 1 THEN v_rg_cairo ELSE v_rg_delta END,
    CASE WHEN i % 2 = 1 THEN (CASE WHEN i % 4 = 1 THEN v_ar_caire ELSE v_ar_cairw END) ELSE v_ar_tanta END,
    30.0444 + (i * 0.001),
    31.2357 + (i * 0.001),
    true, true
  FROM generate_series(1, 24) AS i
  ON CONFLICT (company_id, code) DO NOTHING;

  -- One key-account customer joins the Wholesale tier.
  SELECT id INTO v_cust_key FROM erp_customers WHERE company_id = v_company AND code = 'FD-C0002';
  IF v_cust_key IS NOT NULL AND v_tier_whs IS NOT NULL THEN
    INSERT INTO erp_wholesale_customer_tier (customer_id, company_id, tier_id)
    VALUES (v_cust_key, v_company, v_tier_whs)
    ON CONFLICT (customer_id) DO NOTHING;
  END IF;

  -- ── Pricing rules (showcase resolution: customer > segment > list > base) ────
  -- Customer-specific fixed price on Oil 1L for the key account.
  IF v_cust_key IS NOT NULL AND v_p_oil IS NOT NULL AND
     NOT EXISTS (SELECT 1 FROM erp_price_rules WHERE company_id = v_company AND product_id = v_p_oil AND scope_type='customer' AND scope_id = v_cust_key) THEN
    INSERT INTO erp_price_rules (company_id, product_id, scope_type, scope_id, price_type, value, priority)
    VALUES (v_company, v_p_oil, 'customer', v_cust_key, 'fixed', 42.00, 100);
  END IF;
  -- Segment rule: 5% off for the wholesale segment on Oil 1L.
  IF v_p_oil IS NOT NULL AND v_seg_whs IS NOT NULL AND
     NOT EXISTS (SELECT 1 FROM erp_price_rules WHERE company_id = v_company AND product_id = v_p_oil AND scope_type='segment' AND scope_id = v_seg_whs) THEN
    INSERT INTO erp_price_rules (company_id, product_id, scope_type, scope_id, price_type, value, priority)
    VALUES (v_company, v_p_oil, 'segment', v_seg_whs, 'percent_off', 5, 50);
  END IF;

  -- ── Routes ──────────────────────────────────────────────────────────────────
  INSERT INTO erp_routes (company_id, name, van_warehouse_id, visit_day)
  SELECT v_company, 'Route Cairo East', v_wh, 'sat'
  WHERE NOT EXISTS (SELECT 1 FROM erp_routes WHERE company_id = v_company AND name = 'Route Cairo East');
  INSERT INTO erp_routes (company_id, name, van_warehouse_id, visit_day)
  SELECT v_company, 'Route Delta', v_wh, 'mon'
  WHERE NOT EXISTS (SELECT 1 FROM erp_routes WHERE company_id = v_company AND name = 'Route Delta');

  -- ── Sample DRAFT sales orders + invoices (no stock/GL side effects) ─────────
  -- Three draft invoices for the first customers, two lines each.
  PERFORM 1 FROM erp_invoices WHERE invoice_number = 'FD-INV-0001';
  IF NOT FOUND THEN
    INSERT INTO erp_invoices (branch_id, customer_id, invoice_number, status, total_amount, discount_amount, tax_amount, net_amount)
    SELECT v_branch, c.id,
           'FD-INV-' || lpad(c.code_n::text, 4, '0'),
           'draft', 0, 0, 0, 0
    FROM (
      SELECT id, (row_number() OVER (ORDER BY code)) AS code_n
      FROM erp_customers WHERE company_id = v_company AND code IN ('FD-C0001','FD-C0002','FD-C0003')
    ) c;

    -- Two lines per invoice (Oil 1L + Sugar), then roll up header totals.
    INSERT INTO erp_invoice_lines (invoice_id, product_id, quantity, unit_price, discount_pct, line_total)
    SELECT inv.id, p.id, q.qty, p.sell_price, 0, q.qty * p.sell_price
    FROM erp_invoices inv
    JOIN (VALUES ('FD-OIL1', 10::numeric), ('FD-SUG1', 20::numeric)) AS q(code, qty) ON true
    JOIN erp_products_catalog p ON p.company_id = v_company AND p.code = q.code
    WHERE inv.invoice_number LIKE 'FD-INV-%'
      AND NOT EXISTS (SELECT 1 FROM erp_invoice_lines l WHERE l.invoice_id = inv.id);

    UPDATE erp_invoices inv SET
      total_amount = t.gross,
      tax_amount   = round(t.gross * 0.14, 2),
      net_amount   = t.gross + round(t.gross * 0.14, 2)
    FROM (SELECT invoice_id, sum(line_total) AS gross FROM erp_invoice_lines GROUP BY invoice_id) t
    WHERE inv.id = t.invoice_id AND inv.invoice_number LIKE 'FD-INV-%' AND inv.total_amount = 0;
  END IF;

  RAISE NOTICE 'FMCG demo seed complete for company %', v_company;
END $fmcg_seed$;
