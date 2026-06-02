-- ============================================================================
-- 0110: Composite indexes for pilot performance (DB Scalability Review "Must Do")
-- ----------------------------------------------------------------------------
-- Adds the composite indexes that match the platform's real query shapes (status
-- + date, company + salesperson, warehouse + product + date). ADDITIVE +
-- idempotent (CREATE INDEX IF NOT EXISTS); no data change.
--
-- Locking note: at pilot volume the target tables are small/empty, so plain
-- CREATE INDEX is safe. For an ALREADY-POPULATED production database, create
-- these CONCURRENTLY (outside a transaction) or in a low-traffic window — see
-- docs/SLICE-COMPOSITE-INDEXES.md §5/§6. Held from production.
-- ============================================================================

-- Invoices — aging / overdue / status dashboards
CREATE INDEX IF NOT EXISTS idx_inv_branch_status_due     ON erp_invoices(branch_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_inv_branch_status_created ON erp_invoices(branch_id, status, created_at);

-- Sales orders — order status summaries
CREATE INDEX IF NOT EXISTS idx_so_branch_status_created  ON erp_sales_orders(branch_id, status, created_at);

-- Customers — rep dashboards + index-friendly scope path (RLS rep filter)
CREATE INDEX IF NOT EXISTS idx_cust_company_salesman     ON erp_customers(company_id, salesman_id);

-- Stock movements — inventory ledger / variance by product and by type over time
CREATE INDEX IF NOT EXISTS idx_sm_wh_product_created     ON erp_stock_movements(warehouse_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sm_wh_type_created        ON erp_stock_movements(warehouse_id, movement_type, created_at);

-- Accounting — period close / trial balance / posting aggregates
CREATE INDEX IF NOT EXISTS idx_je_branch_date_status     ON erp_journal_entries(branch_id, entry_date, status);
CREATE INDEX IF NOT EXISTS idx_jl_entry_account          ON erp_journal_lines(journal_entry_id, account_id);

-- Payments — AR / cash-flow by invoice over time
CREATE INDEX IF NOT EXISTS idx_pay_invoice_date          ON erp_payments(invoice_id, payment_date);

-- Visits — customer visit history / KPIs
CREATE INDEX IF NOT EXISTS idx_visits_customer_date      ON erp_visits(customer_id, visit_date);

-- Workflow tasks — approval inbox/dashboards (ordered)
CREATE INDEX IF NOT EXISTS idx_wf_tasks_company_status_created ON erp_workflow_tasks(company_id, status, created_at DESC);

-- Audit log — per-company audit viewer (ordered)
CREATE INDEX IF NOT EXISTS idx_audit_company_created     ON erp_audit_logs(company_id, created_at DESC);

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_inv_branch_status_due, idx_inv_branch_status_created,
--   idx_so_branch_status_created, idx_cust_company_salesman, idx_sm_wh_product_created,
--   idx_sm_wh_type_created, idx_je_branch_date_status, idx_jl_entry_account,
--   idx_pay_invoice_date, idx_visits_customer_date, idx_wf_tasks_company_status_created,
--   idx_audit_company_created;
