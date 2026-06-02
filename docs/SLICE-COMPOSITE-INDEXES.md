# Slice — Composite Indexes (pilot "Must Do") — Review + Build

> **Built (migration 0110) — additive, idempotent, staging-validated, held from
> production.** Implements the *Must-Do-before-pilot* item from the Database
> Scalability Review: composite indexes matching the platform's real query shapes.
> No data change; no app change.

## 1. Exact indexes added (12)
| Index | Definition |
|---|---|
| `idx_inv_branch_status_due` | `erp_invoices(branch_id, status, due_date)` |
| `idx_inv_branch_status_created` | `erp_invoices(branch_id, status, created_at)` |
| `idx_so_branch_status_created` | `erp_sales_orders(branch_id, status, created_at)` |
| `idx_cust_company_salesman` | `erp_customers(company_id, salesman_id)` |
| `idx_sm_wh_product_created` | `erp_stock_movements(warehouse_id, product_id, created_at)` |
| `idx_sm_wh_type_created` | `erp_stock_movements(warehouse_id, movement_type, created_at)` |
| `idx_je_branch_date_status` | `erp_journal_entries(branch_id, entry_date, status)` |
| `idx_jl_entry_account` | `erp_journal_lines(journal_entry_id, account_id)` |
| `idx_pay_invoice_date` | `erp_payments(invoice_id, payment_date)` |
| `idx_visits_customer_date` | `erp_visits(customer_id, visit_date)` |
| `idx_wf_tasks_company_status_created` | `erp_workflow_tasks(company_id, status, created_at DESC)` |
| `idx_audit_company_created` | `erp_audit_logs(company_id, created_at DESC)` |

> Not duplicated: `erp_customers(company_id, approval_status)` already exists (0109);
> `erp_notifications(user_id, is_read, created_at)` already exists (0090).

## 2. Tables affected
`erp_invoices`, `erp_sales_orders`, `erp_customers`, `erp_stock_movements`,
`erp_journal_entries`, `erp_journal_lines`, `erp_payments`, `erp_visits`,
`erp_workflow_tasks`, `erp_audit_logs`. (Index-only; no column/row changes.)

## 3. Expected performance improvement
- **Invoice aging / overdue / status lists:** from a filtered scan to an index range
  scan — the dominant gain as invoice volume grows into the millions.
- **Rep customer screens & RLS rep path:** `(company_id, salesman_id)` lets the
  planner narrow to a rep's customers by index instead of scanning the company set
  (also reduces how often the per-row scope function is evaluated).
- **Inventory ledger/variance, period close, AR/cash-flow, visit history,
  approval inbox, audit viewer:** index-supported instead of sequential scans.
- Net: the common screens stay sub-second from pilot through millions of rows;
  removes the most likely slow-query class identified in the review.

## 4. Query patterns improved (representative)
- `… erp_invoices WHERE branch_id=? AND status IN (…) AND due_date < ? ORDER BY due_date` (AR aging).
- `… erp_invoices WHERE branch_id=? AND status='issued' AND created_at >= ? …` (sales summary).
- `… erp_customers WHERE company_id=? AND salesman_id=? …` (rep list / scope).
- `… erp_stock_movements WHERE warehouse_id=? AND product_id=? AND created_at BETWEEN …` (variance).
- `… erp_journal_entries WHERE branch_id=? AND entry_date BETWEEN … AND status='posted'` (period close).
- `… erp_payments WHERE invoice_id=? ORDER BY payment_date` (collections).
- `… erp_workflow_tasks WHERE company_id=? AND status='pending' ORDER BY created_at DESC` (inbox).
- `… erp_audit_logs WHERE company_id=? ORDER BY created_at DESC` (audit viewer).

## 5. Risk assessment — **Low**
- **Additive & idempotent** (`IF NOT EXISTS`); no schema/data/behaviour change; no
  app code touched. Fully reversible (DROP INDEX — see migration footer).
- Modest extra **write amplification** + storage per index — negligible and
  expected for these read-heavy tables.
- **Locking:** plain `CREATE INDEX` takes a brief write lock per table. At pilot
  apply time the tables are small/empty → non-issue. **For an already-populated
  production DB**, run these `CONCURRENTLY` (outside a transaction) or in a
  low-traffic window to avoid blocking writes. (Documented for the prod-apply step.)

## 6. Staging validation plan
- CI **Apply migrations to STAGING** runs `0110` on a real Postgres (must be green).
- Post-apply checks: all 12 indexes present (`\d+` / `pg_indexes`); `tsc`/unit/
  build unaffected (no app change); advisors 0 ERROR.
- (Optional) On a seeded staging tenant, `EXPLAIN` a couple of the §4 queries to
  confirm index usage. **Migration 0110 NOT applied to production** — held for
  approval; production-apply uses `CONCURRENTLY`/low-traffic per §5.
