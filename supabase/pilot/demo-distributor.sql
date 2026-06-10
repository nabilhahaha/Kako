-- ============================================================================
-- VANTORA — FMCG PILOT DEMO DISTRIBUTOR PROVISIONING
-- ----------------------------------------------------------------------------
-- Provisions a realistic demo distributor tenant for a controlled FMCG pilot:
-- company, branch, main warehouse, one rep van, four pilot users (admin /
-- supervisor / warehouse keeper / salesman), 10 priced+taxed SKUs loaded on the
-- van, 20 approved customers with credit limits + GPS, a customer promo, return
-- reasons, and the Van Sales policy. Idempotent on the company NAME — re-running
-- is a no-op once the company exists.
--
-- HOW TO RUN
--   1. Use a DEDICATED demo/staging Supabase project (NOT production).
--   2. Ensure KAKO_VAN_SALES=1 in that environment.
--   3. USERS: this script seeds auth.users directly so the demo is self-contained.
--      For a production-grade pilot, instead INVITE the four users through the app
--      (Settings → Users) and remove the auth.users inserts below, then re-link.
--   4. Run this whole file in the SQL editor. It prints the created IDs + a
--      summary at the end. It runs in one transaction (a DO block).
--
-- The matching automated rehearsal lives in
-- src/test/integration/pilot-dry-run.test.ts (open day → sell → collect → return
-- → reconcile → close) — green = the same flow this tenant will run.
-- ============================================================================

DO $$
DECLARE
  v_company uuid;
  v_branch  uuid;
  v_main    uuid;
  v_van     uuid;
  v_admin   uuid := gen_random_uuid();
  v_sup     uuid := gen_random_uuid();
  v_wh      uuid := gen_random_uuid();
  v_rep     uuid := gen_random_uuid();
  v_reason  uuid;
  v_prod    uuid;
  v_first   uuid;
  v_cust    uuid;
  i         int;
BEGIN
  -- Idempotency: skip if the demo company already exists.
  SELECT id INTO v_company FROM erp_companies WHERE name = 'Nile FMCG Distribution Co.';
  IF v_company IS NOT NULL THEN
    RAISE NOTICE 'Demo company already exists (%). Nothing to do.', v_company;
    RETURN;
  END IF;

  -- Company + Van Sales policy + FMCG settings + return reasons.
  INSERT INTO erp_companies(name, currency, country) VALUES ('Nile FMCG Distribution Co.', 'EGP', 'EG') RETURNING id INTO v_company;
  INSERT INTO erp_van_sales_settings(company_id, is_enabled, discount_cap_pct, allow_negative_van_stock, require_physical_count_on_close)
    VALUES (v_company, true, 15, false, true);
  INSERT INTO erp_fmcg_settings(company_id) VALUES (v_company) ON CONFLICT DO NOTHING;
  INSERT INTO erp_return_reasons(company_id, code, label_en, label_ar) VALUES
    (v_company, 'damaged', 'Damaged', 'تالف'),
    (v_company, 'expired', 'Expired', 'منتهي الصلاحية'),
    (v_company, 'wrong_item', 'Wrong item', 'صنف خاطئ'),
    (v_company, 'customer_rejection', 'Customer rejection', 'رفض العميل')
  ON CONFLICT (company_id, code) DO NOTHING;
  SELECT id INTO v_reason FROM erp_return_reasons WHERE company_id = v_company AND code = 'damaged';

  -- Branch + main (source) warehouse.
  INSERT INTO erp_branches(company_id, code, name) VALUES (v_company, 'CAI', 'Cairo HQ') RETURNING id INTO v_branch;
  INSERT INTO erp_warehouses(branch_id, code, name) VALUES (v_branch, 'WH-CAI', 'Main Warehouse') RETURNING id INTO v_main;

  -- Pilot users (auth + branch role). REMOVE this block + use real invites for a
  -- production pilot; keep it for a self-contained demo project.
  INSERT INTO auth.users(id, email) VALUES
    (v_admin, 'admin@nile-demo.test'), (v_sup, 'supervisor@nile-demo.test'),
    (v_wh, 'warehouse@nile-demo.test'), (v_rep, 'rep@nile-demo.test');
  INSERT INTO erp_user_branches(user_id, branch_id, role, is_default) VALUES
    (v_admin, v_branch, 'admin', true),
    (v_sup,   v_branch, 'supervisor', true),
    (v_wh,    v_branch, 'warehouse_keeper', true),
    (v_rep,   v_branch, 'salesman', true);

  -- The rep's assigned van.
  INSERT INTO erp_warehouses(branch_id, code, name, is_van, assigned_to)
    VALUES (v_branch, 'VAN-01', 'Rep Van 01', true, v_rep) RETURNING id INTO v_van;

  -- 10 SKUs (priced; SKU-0 carries 14% VAT) loaded 240 units each on the van.
  FOR i IN 0..9 LOOP
    INSERT INTO erp_products_catalog(company_id, code, name, sell_price, tax_rate)
      VALUES (v_company, 'SKU-' || lpad(i::text, 3, '0'), 'Demo Product ' || i, 25 + i * 15, CASE WHEN i = 0 THEN 14 ELSE 0 END)
      RETURNING id INTO v_prod;
    IF i = 0 THEN v_first := v_prod; END IF;
    INSERT INTO erp_inventory_stock(warehouse_id, product_id, quantity) VALUES (v_van, v_prod, 240);
  END LOOP;

  -- 20 approved customers, credit limit 5,000, GPS near Cairo, assigned to the rep.
  FOR i IN 1..20 LOOP
    INSERT INTO erp_customers(company_id, branch_id, code, name, is_approved, credit_limit, balance, salesman_id, latitude, longitude)
      VALUES (v_company, v_branch, 'C-' || lpad(i::text, 3, '0'), 'Demo Customer ' || i, true, 5000, 0, v_rep,
              30.05 + (i % 5) * 0.001, 31.24 + (i % 5) * 0.001)
      RETURNING id INTO v_cust;
    IF i = 1 THEN
      -- A customer-scoped 10% promo on SKU-0, to demo server-side pricing.
      INSERT INTO erp_price_rules(company_id, product_id, scope_type, scope_id, price_type, value, min_qty, is_active)
        VALUES (v_company, v_first, 'customer', v_cust, 'percent_off', 10, 1, true);
    END IF;
  END LOOP;

  RAISE NOTICE '── VANTORA demo distributor provisioned ─────────────────────';
  RAISE NOTICE 'company   : % (Nile FMCG Distribution Co.)', v_company;
  RAISE NOTICE 'branch    : % (CAI / Cairo HQ)', v_branch;
  RAISE NOTICE 'main wh   : %   van: %', v_main, v_van;
  RAISE NOTICE 'users     : admin=%  supervisor=%  warehouse=%  rep=%', v_admin, v_sup, v_wh, v_rep;
  RAISE NOTICE 'data      : 10 SKUs (240 loaded each) · 20 customers · 4 return reasons · 1 promo';
  RAISE NOTICE 'next      : open /field/van-sales/readiness as the admin → expect READY, then run the dry-run.';
END $$;
