-- ============================================================================
-- VANTORA — GO-LIVE STEP 1: demo-data cleanup for vantora-staging → production
-- ----------------------------------------------------------------------------
-- Removes ALL demo/test tenant data so production starts EMPTY of business data,
-- while KEEPING the schema, the 25 roles (21 system + 4 refined), the global
-- role-permission defaults, modules/features, and the cash-van guard trigger.
--
-- DATA-ONLY. No DROP SCHEMA, no DDL, no migration re-run.
--
-- ░░ SAFETY ░░
--   1. HARD GATE — do NOT run until a verified PITR / backup restore point exists
--      (see docs/onboarding/GOLIVE-STEP1-CLEANUP-REVIEW.md). The wipe is only
--      reversible via that restore point (or by re-running reference-company.sql).
--   2. REFUSES TO RUN unless the project is in the expected pristine demo state:
--      exactly ONE company, ZERO non-"@nile-group.test" auth users. If real data
--      has already been imported, the script aborts untouched.
--   3. DRY-RUN BY DEFAULT — runs inside a transaction that ROLLS BACK and prints
--      what WOULD remain, unless you set the confirm flag.
--
-- ░░ HOW TO RUN ░░
--   DRY RUN (no changes, prints verification):
--       run this file as-is.  →  ends with ROLLBACK + a DRY-RUN notice.
--   APPLY (commit the cleanup):
--       first execute:  SET vantora.cleanup_confirm = 'APPLY';
--       then run this file in the SAME session/transaction.
--   (Via psql:  psql "$URL" -c "SET vantora.cleanup_confirm='APPLY'" -f this.sql
--    won't share the session — instead prepend the SET inside the file's BEGIN,
--    or run both in one -c string. Via the Supabase SQL editor / MCP, include the
--    SET line in the same submission, immediately after BEGIN.)
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

-- (To APPLY, uncomment the next line — or issue the same SET in this transaction.)
-- SET LOCAL vantora.cleanup_confirm = 'APPLY';

DO $cleanup$
DECLARE
  v_co            uuid;
  v_company_cnt   int;
  v_nontest_users int;
  v_confirm       text := current_setting('vantora.cleanup_confirm', true);
BEGIN
  --------------------------------------------------------------------------
  -- SAFETY GATE — refuse on anything other than the pristine single-demo state
  --------------------------------------------------------------------------
  SELECT count(*) INTO v_company_cnt FROM erp_companies;
  SELECT count(*) INTO v_nontest_users FROM auth.users WHERE email NOT LIKE '%@nile-group.test';
  SELECT id INTO v_co FROM erp_companies WHERE name = 'Nile FMCG Distribution Group';

  IF v_company_cnt <> 1 THEN
    RAISE EXCEPTION 'ABORT: expected exactly 1 (demo) company, found % — refusing to run.', v_company_cnt;
  END IF;
  IF v_nontest_users > 0 THEN
    RAISE EXCEPTION 'ABORT: % non-demo auth user(s) present (not @nile-group.test) — refusing to run.', v_nontest_users;
  END IF;
  IF v_co IS NULL THEN
    RAISE EXCEPTION 'ABORT: demo company "Nile FMCG Distribution Group" not found.';
  END IF;

  --------------------------------------------------------------------------
  -- Defensive pre-deletes: RESTRICT-FK transaction tables (empty today, but
  -- this makes the script safe even if a demo dry-run created documents).
  -- Headers first; their line tables cascade. Scoped to the demo company.
  --------------------------------------------------------------------------
  -- branch-scoped documents
  DELETE FROM erp_collections        WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_sales_returns      WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_invoices           WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_sales_orders       WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_purchase_returns   WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_supplier_invoices  WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_purchase_orders    WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_rma                WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_payment_vouchers   WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_receipt_vouchers   WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_journal_entries    WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_bank_accounts      WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  -- warehouse-scoped documents
  DELETE FROM erp_transfer_orders    WHERE from_warehouse_id IN (SELECT w.id FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id WHERE b.company_id = v_co)
                                        OR to_warehouse_id   IN (SELECT w.id FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id WHERE b.company_id = v_co);
  DELETE FROM erp_van_transfers      WHERE from_warehouse_id IN (SELECT w.id FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id WHERE b.company_id = v_co)
                                        OR to_warehouse_id   IN (SELECT w.id FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id WHERE b.company_id = v_co);
  DELETE FROM erp_van_load_manifests WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);
  DELETE FROM erp_goods_receipts     WHERE warehouse_id IN (SELECT w.id FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id WHERE b.company_id = v_co);
  DELETE FROM erp_stock_movements    WHERE warehouse_id IN (SELECT w.id FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id WHERE b.company_id = v_co);
  DELETE FROM erp_stock_requests     WHERE branch_id IN (SELECT id FROM erp_branches WHERE company_id = v_co);

  --------------------------------------------------------------------------
  -- Identities: delete demo auth users (cascades erp_profiles + memberships).
  --------------------------------------------------------------------------
  DELETE FROM auth.users WHERE email LIKE '%@nile-group.test';

  --------------------------------------------------------------------------
  -- The company: ON DELETE CASCADE removes ALL remaining tenant rows
  -- (branches → warehouses → stock, customers, products, suppliers, price
  -- lists/items/rules, routes, departments, job titles, settings, return
  -- reasons, company_role_permissions, …). erp_audit_logs.company_id is SET NULL.
  --------------------------------------------------------------------------
  DELETE FROM erp_companies WHERE id = v_co;

  --------------------------------------------------------------------------
  -- Post-delete verification — everything tenant must be zero; globals intact.
  --------------------------------------------------------------------------
  IF (SELECT count(*) FROM erp_companies) <> 0
     OR (SELECT count(*) FROM auth.users WHERE email LIKE '%@nile-group.test') <> 0
     OR (SELECT count(*) FROM erp_branches) <> 0
     OR (SELECT count(*) FROM erp_customers) <> 0
     OR (SELECT count(*) FROM erp_products_catalog) <> 0
     OR (SELECT count(*) FROM erp_company_role_permissions) <> 0
  THEN
    RAISE EXCEPTION 'ABORT: post-delete verification found residual tenant rows — rolling back.';
  END IF;

  IF (SELECT count(*) FROM erp_roles) < 25
     OR (SELECT count(*) FROM erp_role_permissions) < 394
  THEN
    RAISE EXCEPTION 'ABORT: global roles/permissions were affected (roles<25 or perms<394) — rolling back.';
  END IF;

  --------------------------------------------------------------------------
  -- Commit gate. Without the confirm flag, abort to force a ROLLBACK (dry run).
  --------------------------------------------------------------------------
  IF v_confirm IS DISTINCT FROM 'APPLY' THEN
    RAISE EXCEPTION
      'DRY RUN OK — cleanup verified and ROLLED BACK (no changes). Kept: % roles, % global perms. To APPLY, set vantora.cleanup_confirm=''APPLY'' in this transaction.',
      (SELECT count(*) FROM erp_roles), (SELECT count(*) FROM erp_role_permissions);
  END IF;

  RAISE NOTICE 'CLEANUP APPLIED — demo data removed; schema + roles + globals retained.';
END $cleanup$;

COMMIT;
-- If the DO block raised (dry run or abort), this COMMIT is reached on a failed
-- transaction and Postgres turns it into ROLLBACK — no changes persist. Only a
-- clean APPLY run reaches COMMIT successfully.
