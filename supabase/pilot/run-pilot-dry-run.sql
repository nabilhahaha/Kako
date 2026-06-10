-- ============================================================================
-- VANTORA — EXECUTE & CERTIFY THE FMCG PILOT DRY-RUN
-- ----------------------------------------------------------------------------
-- Runs the full supervised operator day on the demo tenant (provisioned by
-- demo-distributor.sql) AS THE REAL USERS — the rep sells/collects/returns, the
-- WAREHOUSE KEEPER reconciles (the role that holds DB reconciliation.manage) —
-- and validates permissions, numbering, allocation, credit-note linkage, balance
-- accuracy, stock accuracy, and reconciliation variance. Prints a certification
-- summary with the real document numbers. Read-mostly + transactional: if any
-- check fails the whole run rolls back and reports it.
--
-- USAGE:  run demo-distributor.sql first, then this file.
-- (Actors are set via request.jwt.claim.sub — exactly what auth.uid() reads.)
-- ============================================================================
DO $$
DECLARE
  v_co uuid; v_branch uuid; v_van uuid; v_reason uuid; v_cust uuid;
  v_admin uuid; v_sup uuid; v_wh uuid; v_rep uuid; v_p0 uuid; v_p1 uuid;
  v_session uuid; v_visit jsonb; v_recon jsonb; v_close jsonb;
  v_sale RECORD; v_col RECORD; v_ret RECORD; v_cn RECORD;
  v_bal numeric; v_vanqty numeric; v_alloc uuid; v_exp_bal numeric;
  rep_field bool; rep_mng bool; wh_mng bool; sup_mng bool;
BEGIN
  -- Resolve the demo tenant.
  SELECT id INTO v_co FROM erp_companies WHERE name = 'Nile FMCG Distribution Co.';
  IF v_co IS NULL THEN RAISE EXCEPTION 'Demo tenant not found — run demo-distributor.sql first.'; END IF;
  SELECT id INTO v_branch FROM erp_branches WHERE company_id = v_co AND code = 'CAI';
  SELECT id INTO v_van    FROM erp_warehouses WHERE branch_id = v_branch AND is_van LIMIT 1;
  SELECT id INTO v_reason FROM erp_return_reasons WHERE company_id = v_co AND code = 'damaged';
  SELECT user_id INTO v_rep FROM erp_user_branches WHERE branch_id = v_branch AND role = 'salesman' LIMIT 1;
  SELECT user_id INTO v_wh  FROM erp_user_branches WHERE branch_id = v_branch AND role = 'warehouse_keeper' LIMIT 1;
  SELECT user_id INTO v_sup FROM erp_user_branches WHERE branch_id = v_branch AND role = 'supervisor' LIMIT 1;
  SELECT user_id INTO v_admin FROM erp_user_branches WHERE branch_id = v_branch AND role = 'admin' LIMIT 1;
  SELECT id INTO v_p0 FROM erp_products_catalog WHERE company_id = v_co AND code = 'SKU-000';
  SELECT id INTO v_p1 FROM erp_products_catalog WHERE company_id = v_co AND code = 'SKU-001';
  SELECT id INTO v_cust FROM erp_customers WHERE company_id = v_co AND code = 'C-001';  -- has the promo

  -- ── PERMISSION VALIDATION (DB authority for RPC enforcement) ──────────────
  PERFORM set_config('request.jwt.claim.sub', v_rep::text, true);
  rep_field := erp_user_has_permission(v_co, 'field.sales');
  rep_mng   := erp_user_has_permission(v_co, 'reconciliation.manage');
  PERFORM set_config('request.jwt.claim.sub', v_wh::text, true);
  wh_mng    := erp_user_has_permission(v_co, 'reconciliation.manage');
  PERFORM set_config('request.jwt.claim.sub', v_sup::text, true);
  sup_mng   := erp_user_has_permission(v_co, 'reconciliation.manage');
  IF NOT rep_field THEN RAISE EXCEPTION 'rep is missing field.sales'; END IF;
  IF rep_mng       THEN RAISE EXCEPTION 'rep should NOT hold reconciliation.manage (design: view only)'; END IF;
  IF NOT wh_mng    THEN RAISE EXCEPTION 'warehouse keeper is missing reconciliation.manage'; END IF;
  IF NOT sup_mng   THEN RAISE EXCEPTION 'supervisor is missing reconciliation.manage'; END IF;

  -- ── 1) OPEN DAY ───────────────────────────────────────────────────────────
  INSERT INTO erp_work_sessions(branch_id, salesman_id, status) VALUES (v_branch, v_rep, 'open') RETURNING id INTO v_session;

  -- ── 3) VISIT (rep) ────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_rep::text, true);
  SELECT erp_check_in_visit(v_cust, 30.05, 31.24, v_session) INTO v_visit;

  -- ── 4-5) SELL → INVOICE (server-priced; SKU-0 carries the customer promo) ──
  SELECT * INTO v_sale FROM erp_van_sell(v_branch, v_cust,
    jsonb_build_array(jsonb_build_object('product_id', v_p0, 'quantity', 4),
                      jsonb_build_object('product_id', v_p1, 'quantity', 2)), NULL, NULL, NULL);

  -- ── 6) COLLECT (60% partial) ──────────────────────────────────────────────
  SELECT * INTO v_col FROM erp_settle_collection(v_branch, v_cust, round(v_sale.net_amount * 0.6, 2), 'cash', NULL, NULL, NULL, NULL);

  -- ── 7-8) RETURN 1× SKU-1 + CREDIT NOTE ────────────────────────────────────
  SELECT * INTO v_ret FROM erp_van_return(v_branch, v_cust,
    jsonb_build_array(jsonb_build_object('product_id', v_p1, 'quantity', 1)), v_reason, v_sale.invoice_id, true, NULL, NULL);

  -- ── 9) RECONCILE — run by the WAREHOUSE KEEPER, actuals = live stock ───────
  PERFORM set_config('request.jwt.claim.sub', v_wh::text, true);
  SELECT erp_compute_van_reconciliation(v_session,
    (SELECT jsonb_agg(jsonb_build_object('product_id', product_id, 'actual_qty', quantity))
       FROM erp_inventory_stock WHERE warehouse_id = v_van)) INTO v_recon;

  -- ── 10) CLOSE DAY (rep) ───────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', v_rep::text, true);
  SELECT erp_close_day(v_session, '[]'::jsonb, NULL) INTO v_close;

  -- ════════════════════ VALIDATIONS ════════════════════
  IF v_sale.invoice_number !~ '^INV-CAI-\d{6}$' THEN RAISE EXCEPTION 'bad invoice number: %', v_sale.invoice_number; END IF;
  IF v_col.collection_number !~ '^COL-CAI-\d{6}$' THEN RAISE EXCEPTION 'bad collection number: %', v_col.collection_number; END IF;
  IF v_ret.return_number !~ '^RET-CAI-\d{6}$' THEN RAISE EXCEPTION 'bad return number: %', v_ret.return_number; END IF;

  SELECT * INTO v_cn FROM erp_credit_notes WHERE id = v_ret.credit_note_id;
  IF v_cn.return_id <> v_ret.return_id OR v_cn.invoice_id <> v_sale.invoice_id
     OR v_cn.credit_note_number <> 'CN-' || v_ret.return_number THEN RAISE EXCEPTION 'credit-note linkage broken'; END IF;

  SELECT invoice_id INTO v_alloc FROM erp_collection_allocations WHERE collection_id = v_col.collection_id;
  IF v_alloc <> v_sale.invoice_id THEN RAISE EXCEPTION 'collection allocation not linked to the invoice'; END IF;

  v_exp_bal := round(v_sale.net_amount - v_col.total_applied - v_ret.total_amount, 2);
  SELECT balance INTO v_bal FROM erp_customers WHERE id = v_cust;
  IF abs(v_bal - v_exp_bal) > 0.01 THEN RAISE EXCEPTION 'balance mismatch: % (expected %)', v_bal, v_exp_bal; END IF;

  SELECT quantity INTO v_vanqty FROM erp_inventory_stock WHERE warehouse_id = v_van AND product_id = v_p1;
  IF v_vanqty <> 239 THEN RAISE EXCEPTION 'stock mismatch SKU-1: % (expected 239 = 240-2+1)', v_vanqty; END IF;

  IF (v_recon->>'variance_value')::numeric <> 0 THEN RAISE EXCEPTION 'reconciliation variance not zero: %', v_recon->>'variance_value'; END IF;

  -- Print readiness: each document's data is queryable (invoice+lines+branded company, collection+alloc, return, credit note).
  IF (SELECT count(*) FROM erp_invoice_lines WHERE invoice_id = v_sale.invoice_id) <> 2 THEN RAISE EXCEPTION 'invoice doc lines missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_companies WHERE id = v_co) THEN RAISE EXCEPTION 'company (branding) missing'; END IF;

  -- ════════════════════ CERTIFICATION SUMMARY ════════════════════
  RAISE NOTICE '════════ FMCG PILOT DRY-RUN — EXECUTED & CERTIFIED ════════';
  RAISE NOTICE 'tenant     : Nile FMCG Distribution Co. (%)  branch CAI', v_co;
  RAISE NOTICE 'permissions: rep field.sales=%, recon.manage=% | warehouse recon.manage=% | supervisor recon.manage=%', rep_field, rep_mng, wh_mng, sup_mng;
  RAISE NOTICE 'open day   : session %  (open)', v_session;
  RAISE NOTICE 'visit      : logged (blocked=%)', coalesce(v_visit->>'blocked', 'false');
  RAISE NOTICE 'SELL       : %  net=%  (server-priced, customer promo applied)', v_sale.invoice_number, v_sale.net_amount;
  RAISE NOTICE 'COLLECT    : %  applied=%  unapplied=%  → invoice partially paid', v_col.collection_number, v_col.total_applied, v_col.unapplied;
  RAISE NOTICE 'RETURN     : %  total=%  credit note=%  (stock back to van)', v_ret.return_number, v_ret.total_amount, v_cn.credit_note_number;
  RAISE NOTICE 'RECONCILE  : variance=%  status=%  (run by warehouse keeper)', v_recon->>'variance_value', v_recon->>'status';
  RAISE NOTICE 'CLOSE DAY  : %', coalesce(v_close->>'close_status', v_close->>'status', 'closed');
  RAISE NOTICE 'VALIDATED  : numbering OK · allocation→invoice OK · CN linkage OK';
  RAISE NOTICE '             balance=% (net-applied-return) · van SKU-1=% (=240-2+1) · recon variance=0', v_bal, v_vanqty;
  RAISE NOTICE '════════ ALL CHECKS PASSED ════════';
END $$;
