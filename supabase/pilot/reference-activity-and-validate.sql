-- ============================================================================
-- VANTORA — ENTERPRISE REFERENCE COMPANY (sample activity + role validation)
-- ----------------------------------------------------------------------------
-- Runs AFTER reference-company.sql. Two parts, one transaction:
--   PART A — realistic transactional activity executed AS THE REAL USERS on the
--            real RPCs: van sell → collect → return (+credit note) across
--            branches, day-end reconciliation (warehouse keeper), close day.
--   PART B — role-by-role permission validation: for every identity, asserts a
--            spread of ALLOWED + BLOCKED permissions via erp_user_has_permission
--            (the same DB authority the RPCs enforce). Any mismatch aborts.
-- Plus end-to-end invariant checks (numbering, allocation, credit-note linkage,
-- customer balance, van stock, reconciliation variance) and a summary.
--
-- Re-runnable: skips PART A activity if this reference day already has a session
-- (keeps validation idempotent for regression use).
-- ============================================================================
DO $$
DECLARE
  v_co uuid; v_cai uuid; v_alx uuid;
  v_van_cai uuid; v_van_alx uuid;
  u_vanrep uuid; u_salesman uuid; u_whkeep uuid;
  v_c1 uuid; v_c2 uuid; v_c17 uuid;
  p_bev1 uuid; p_snk1 uuid; p_bev2 uuid; p_dai1 uuid;
  v_reason uuid;
  v_session uuid; v_session_alx uuid; v_visit jsonb; v_recon jsonb; v_close jsonb;
  v_sale RECORD; v_col RECORD; v_ret RECORD; v_cn RECORD;
  v_bal numeric; v_exp_bal numeric; v_vanqty numeric; v_alloc uuid;
  rec RECORD; v_pass int := 0;
BEGIN
  ----------------------------------------------------------------------------
  -- Resolve the reference tenant by stable identifiers.
  ----------------------------------------------------------------------------
  SELECT id INTO v_co FROM erp_companies WHERE name = 'Nile FMCG Distribution Group';
  IF v_co IS NULL THEN RAISE EXCEPTION 'Reference company not found — run reference-company.sql first.'; END IF;
  SELECT id INTO v_cai FROM erp_branches WHERE company_id = v_co AND code = 'CAI';
  SELECT id INTO v_alx FROM erp_branches WHERE company_id = v_co AND code = 'ALX';
  SELECT id INTO v_van_cai FROM erp_warehouses WHERE branch_id = v_cai AND code = 'VAN-CAI-01';
  SELECT id INTO v_van_alx FROM erp_warehouses WHERE branch_id = v_alx AND code = 'VAN-ALX-01';
  SELECT id INTO u_vanrep   FROM auth.users WHERE email = 'van.rep@nile-group.test';
  SELECT id INTO u_salesman FROM auth.users WHERE email = 'salesman@nile-group.test';
  SELECT id INTO u_whkeep   FROM auth.users WHERE email = 'warehouse.keeper@nile-group.test';
  SELECT id INTO v_c1  FROM erp_customers WHERE company_id = v_co AND code = 'CUST-001';
  SELECT id INTO v_c2  FROM erp_customers WHERE company_id = v_co AND code = 'CUST-002';
  SELECT id INTO v_c17 FROM erp_customers WHERE company_id = v_co AND code = 'CUST-017';
  SELECT id INTO p_bev1 FROM erp_products_catalog WHERE company_id = v_co AND code = 'BEV-001';
  SELECT id INTO p_snk1 FROM erp_products_catalog WHERE company_id = v_co AND code = 'SNK-001';
  SELECT id INTO p_bev2 FROM erp_products_catalog WHERE company_id = v_co AND code = 'BEV-002';
  SELECT id INTO p_dai1 FROM erp_products_catalog WHERE company_id = v_co AND code = 'DAI-001';
  SELECT id INTO v_reason FROM erp_return_reasons WHERE company_id = v_co AND code = 'damaged';

  ----------------------------------------------------------------------------
  -- PART A — SAMPLE ACTIVITY (skip if already generated for this reference day)
  ----------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM erp_work_sessions WHERE branch_id = v_cai AND salesman_id = u_vanrep AND work_date = CURRENT_DATE) THEN
    RAISE NOTICE 'Activity already generated for today — skipping PART A, running validation only.';
  ELSE
    -- Cairo van rep: open day → visit → sell (promo SKU) → collect 60% → return + CN
    INSERT INTO erp_work_sessions(branch_id, salesman_id, status) VALUES (v_cai, u_vanrep, 'open') RETURNING id INTO v_session;
    PERFORM set_config('request.jwt.claim.sub', u_vanrep::text, true);
    SELECT erp_check_in_visit(v_c1, 30.051, 31.241, v_session) INTO v_visit;

    SELECT * INTO v_sale FROM erp_van_sell(v_cai, v_c1,
      jsonb_build_array(jsonb_build_object('product_id', p_bev1, 'quantity', 10),
                        jsonb_build_object('product_id', p_snk1, 'quantity', 6)), NULL, NULL, NULL);
    SELECT * INTO v_col FROM erp_settle_collection(v_cai, v_c1, round(v_sale.net_amount * 0.6, 2), 'cash', NULL, NULL, NULL, NULL);
    SELECT * INTO v_ret FROM erp_van_return(v_cai, v_c1,
      jsonb_build_array(jsonb_build_object('product_id', p_snk1, 'quantity', 2)), v_reason, v_sale.invoice_id, true, NULL, NULL);

    -- A second Cairo sale (full collection) for reporting coverage.
    PERFORM erp_check_in_visit(v_c2, 30.052, 31.242, v_session);
    PERFORM erp_van_sell(v_cai, v_c2,
      jsonb_build_array(jsonb_build_object('product_id', p_bev2, 'quantity', 8)), NULL, NULL, NULL);

    -- Alexandria salesman: open day → sell.
    INSERT INTO erp_work_sessions(branch_id, salesman_id, status) VALUES (v_alx, u_salesman, 'open') RETURNING id INTO v_session_alx;
    PERFORM set_config('request.jwt.claim.sub', u_salesman::text, true);
    PERFORM erp_check_in_visit(v_c17, 31.201, 29.921, v_session_alx);
    PERFORM erp_van_sell(v_alx, v_c17,
      jsonb_build_array(jsonb_build_object('product_id', p_dai1, 'quantity', 5)), NULL, NULL, NULL);

    -- Day-end reconciliation by the WAREHOUSE KEEPER (holds reconciliation.manage).
    PERFORM set_config('request.jwt.claim.sub', u_whkeep::text, true);
    SELECT erp_compute_van_reconciliation(v_session,
      (SELECT jsonb_agg(jsonb_build_object('product_id', product_id, 'actual_qty', quantity))
         FROM erp_inventory_stock WHERE warehouse_id = v_van_cai)) INTO v_recon;

    -- Close the Cairo day (rep holds day.close).
    PERFORM set_config('request.jwt.claim.sub', u_vanrep::text, true);
    SELECT erp_close_day(v_session, '[]'::jsonb, NULL) INTO v_close;

    -- ── Invariant checks on the generated activity ──
    IF v_sale.invoice_number !~ '^INV-CAI-\d{6}$' THEN RAISE EXCEPTION 'bad invoice number: %', v_sale.invoice_number; END IF;
    IF v_col.collection_number !~ '^COL-CAI-\d{6}$' THEN RAISE EXCEPTION 'bad collection number: %', v_col.collection_number; END IF;
    IF v_ret.return_number !~ '^RET-CAI-\d{6}$' THEN RAISE EXCEPTION 'bad return number: %', v_ret.return_number; END IF;
    SELECT * INTO v_cn FROM erp_credit_notes WHERE id = v_ret.credit_note_id;
    IF v_cn.return_id <> v_ret.return_id OR v_cn.invoice_id <> v_sale.invoice_id
       OR v_cn.credit_note_number <> 'CN-' || v_ret.return_number THEN RAISE EXCEPTION 'credit-note linkage broken'; END IF;
    SELECT invoice_id INTO v_alloc FROM erp_collection_allocations WHERE collection_id = v_col.collection_id;
    IF v_alloc <> v_sale.invoice_id THEN RAISE EXCEPTION 'collection allocation not linked to the invoice'; END IF;
    v_exp_bal := round(v_sale.net_amount - v_col.total_applied - v_ret.total_amount, 2);
    SELECT balance INTO v_bal FROM erp_customers WHERE id = v_c1;
    IF abs(v_bal - v_exp_bal) > 0.01 THEN RAISE EXCEPTION 'CUST-001 balance mismatch: % (expected %)', v_bal, v_exp_bal; END IF;
    -- Van SNK-001: 250 opening+transfer − 6 sold + 2 returned = 246
    SELECT quantity INTO v_vanqty FROM erp_inventory_stock WHERE warehouse_id = v_van_cai AND product_id = p_snk1;
    IF v_vanqty <> 246 THEN RAISE EXCEPTION 'van SNK-001 mismatch: % (expected 246)', v_vanqty; END IF;
    IF (v_recon->>'variance_value')::numeric <> 0 THEN RAISE EXCEPTION 'reconciliation variance not zero: %', v_recon->>'variance_value'; END IF;

    RAISE NOTICE '── PART A activity ─────────────────────────────────────────';
    RAISE NOTICE 'SELL    : %  net=%  (CUST-001, 10%% promo on BEV-001 applied)', v_sale.invoice_number, v_sale.net_amount;
    RAISE NOTICE 'COLLECT : %  applied=%  unapplied=%', v_col.collection_number, v_col.total_applied, v_col.unapplied;
    RAISE NOTICE 'RETURN  : %  total=%  credit note=%', v_ret.return_number, v_ret.total_amount, v_cn.credit_note_number;
    RAISE NOTICE 'RECON   : variance=%  status=%  (warehouse keeper)', v_recon->>'variance_value', v_recon->>'status';
    RAISE NOTICE 'CLOSE   : %  coverage=%%%', coalesce(v_close->>'close_status','closed'), coalesce(v_close->>'coverage_pct','—');
    RAISE NOTICE 'CUST-001 balance=%  · van SNK-001=% (=250-6+2)', v_bal, v_vanqty;
  END IF;

  ----------------------------------------------------------------------------
  -- PART B — ROLE-BY-ROLE PERMISSION VALIDATION (allowed + blocked)
  -- Asserts erp_user_has_permission(company, perm) matches the expected grant for
  -- every identity. Any deviation aborts the whole run.
  ----------------------------------------------------------------------------
  FOR rec IN
    SELECT email, perm, expected FROM (VALUES
      -- CEO (admin) — full authority
      ('ceo@nile-group.test','sales.sell',true),('ceo@nile-group.test','purchasing.manage',true),
      ('ceo@nile-group.test','accounting.post',true),('ceo@nile-group.test','customers.approve',true),
      ('ceo@nile-group.test','settings.users',true),('ceo@nile-group.test','reconciliation.manage',true),
      -- General Manager (manager)
      ('gm@nile-group.test','sales.sell',true),('gm@nile-group.test','purchasing.manage',true),
      ('gm@nile-group.test','accounting.post',true),('gm@nile-group.test','customers.approve',true),
      ('gm@nile-group.test','settings.users',true),('gm@nile-group.test','field.sales',true),
      -- Finance Manager (accountant)
      ('finance.manager@nile-group.test','accounting.post',true),('finance.manager@nile-group.test','suppliers.manage',true),
      ('finance.manager@nile-group.test','sales.collect',true),('finance.manager@nile-group.test','reports.view',true),
      ('finance.manager@nile-group.test','sales.sell',false),('finance.manager@nile-group.test','purchasing.manage',false),
      ('finance.manager@nile-group.test','customers.approve',false),
      -- Accountant (accountant)
      ('accountant@nile-group.test','accounting.view',true),('accountant@nile-group.test','accounting.post',true),
      ('accountant@nile-group.test','sales.sell',false),('accountant@nile-group.test','field.sales',false),
      ('accountant@nile-group.test','reconciliation.manage',false),
      -- Procurement Manager (branch_manager)
      ('procurement.manager@nile-group.test','purchasing.manage',true),('procurement.manager@nile-group.test','suppliers.manage',true),
      ('procurement.manager@nile-group.test','inventory.adjust',true),('procurement.manager@nile-group.test','reconciliation.manage',true),
      ('procurement.manager@nile-group.test','accounting.post',false),('procurement.manager@nile-group.test','customers.approve',false),
      -- Buyer (warehouse_keeper)
      ('buyer@nile-group.test','purchasing.manage',true),('buyer@nile-group.test','inventory.adjust',true),
      ('buyer@nile-group.test','reconciliation.manage',true),('buyer@nile-group.test','suppliers.manage',false),
      ('buyer@nile-group.test','sales.sell',false),('buyer@nile-group.test','reports.view',false),
      ('buyer@nile-group.test','accounting.post',false),
      -- Sales Manager (regional_manager)
      ('sales.manager@nile-group.test','sales.sell',true),('sales.manager@nile-group.test','sales.collect',true),
      ('sales.manager@nile-group.test','reports.view',true),('sales.manager@nile-group.test','sales.return',true),
      ('sales.manager@nile-group.test','reconciliation.manage',false),('sales.manager@nile-group.test','purchasing.manage',false),
      ('sales.manager@nile-group.test','accounting.post',false),('sales.manager@nile-group.test','field.sales',false),
      -- Supervisor (supervisor)
      ('supervisor@nile-group.test','sales.sell',true),('supervisor@nile-group.test','reconciliation.manage',true),
      ('supervisor@nile-group.test','reconciliation.view',true),('supervisor@nile-group.test','reports.view',true),
      ('supervisor@nile-group.test','purchasing.manage',false),('supervisor@nile-group.test','accounting.post',false),
      ('supervisor@nile-group.test','field.sales',false),('supervisor@nile-group.test','customers.approve',false),
      -- Salesman (salesman)
      ('salesman@nile-group.test','sales.sell',true),('salesman@nile-group.test','sales.collect',true),
      ('salesman@nile-group.test','field.sales',true),('salesman@nile-group.test','day.close',true),
      ('salesman@nile-group.test','reconciliation.view',true),('salesman@nile-group.test','reconciliation.manage',false),
      ('salesman@nile-group.test','purchasing.manage',false),('salesman@nile-group.test','reports.view',false),
      ('salesman@nile-group.test','accounting.post',false),
      -- Van Sales Rep (salesman)
      ('van.rep@nile-group.test','sales.sell',true),('van.rep@nile-group.test','field.sales',true),
      ('van.rep@nile-group.test','day.close',true),('van.rep@nile-group.test','reconciliation.view',true),
      ('van.rep@nile-group.test','reconciliation.manage',false),('van.rep@nile-group.test','purchasing.manage',false),
      -- Warehouse Manager (warehouse_keeper)
      ('warehouse.manager@nile-group.test','purchasing.manage',true),('warehouse.manager@nile-group.test','inventory.adjust',true),
      ('warehouse.manager@nile-group.test','reconciliation.manage',true),('warehouse.manager@nile-group.test','sales.sell',false),
      ('warehouse.manager@nile-group.test','accounting.post',false),('warehouse.manager@nile-group.test','reports.view',false),
      -- Warehouse Keeper (warehouse_keeper)
      ('warehouse.keeper@nile-group.test','inventory.view',true),('warehouse.keeper@nile-group.test','inventory.adjust',true),
      ('warehouse.keeper@nile-group.test','reconciliation.manage',true),('warehouse.keeper@nile-group.test','sales.sell',false),
      ('warehouse.keeper@nile-group.test','field.sales',false),
      -- Inventory Controller (warehouse_keeper)
      ('inventory.controller@nile-group.test','inventory.view',true),('inventory.controller@nile-group.test','inventory.adjust',true),
      ('inventory.controller@nile-group.test','reconciliation.manage',true),('inventory.controller@nile-group.test','sales.sell',false),
      ('inventory.controller@nile-group.test','accounting.post',false),
      -- Merchandiser (salesman)
      ('merchandiser@nile-group.test','field.sales',true),('merchandiser@nile-group.test','sales.sell',true),
      ('merchandiser@nile-group.test','customers.manage',true),('merchandiser@nile-group.test','reconciliation.manage',false),
      ('merchandiser@nile-group.test','purchasing.manage',false),('merchandiser@nile-group.test','accounting.post',false),
      -- Customer Service Agent (cashier)
      ('cs.agent@nile-group.test','sales.sell',true),('cs.agent@nile-group.test','sales.collect',true),
      ('cs.agent@nile-group.test','customers.manage',true),('cs.agent@nile-group.test','reports.view',false),
      ('cs.agent@nile-group.test','reconciliation.view',false),('cs.agent@nile-group.test','customers.approve',false),
      ('cs.agent@nile-group.test','accounting.post',false),
      -- Read-Only Executive (viewer)
      ('readonly.exec@nile-group.test','reports.view',true),('readonly.exec@nile-group.test','accounting.view',true),
      ('readonly.exec@nile-group.test','inventory.view',true),('readonly.exec@nile-group.test','sales.sell',false),
      ('readonly.exec@nile-group.test','sales.collect',false),('readonly.exec@nile-group.test','purchasing.manage',false),
      ('readonly.exec@nile-group.test','customers.approve',false),('readonly.exec@nile-group.test','reconciliation.manage',false),
      -- Platform Owner (cross-tenant: all true via short-circuit)
      ('owner@nile-group.test','sales.sell',true),('owner@nile-group.test','purchasing.manage',true),
      ('owner@nile-group.test','accounting.post',true),('owner@nile-group.test','settings.users',true)
    ) AS t(email, perm, expected)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email = rec.email), true);
    IF erp_user_has_permission(v_co, rec.perm::text) <> rec.expected THEN
      RAISE EXCEPTION 'PERMISSION VALIDATION FAILED: % expected %=% but got the opposite', rec.email, rec.perm, rec.expected;
    END IF;
    v_pass := v_pass + 1;
  END LOOP;

  RAISE NOTICE '── PART B permission validation ────────────────────────────';
  RAISE NOTICE 'all % role/permission assertions passed (allowed + blocked verified per role)', v_pass;
  RAISE NOTICE '════════ REFERENCE COMPANY — ACTIVITY GENERATED & ROLES VALIDATED ════════';
END $$;
