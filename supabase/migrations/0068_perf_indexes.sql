-- 0068_perf_indexes.sql
-- Performance indexes for the high-volume list/report queries.
--
-- Every list page orders newest-first (ORDER BY created_at DESC, or a domain
-- date) and is scoped by its tenant column. The sales/accounting tables are
-- branch-scoped (no company_id column); the verticals carry company_id. The
-- composite indexes below match "scope + order" so pagination ranges stay on an
-- index instead of sorting the whole table. All are IF NOT EXISTS so the
-- migration is safe to re-run.

-- ── Sales / purchasing / accounting (branch-scoped) ────────────────────────
-- Lists: ORDER BY created_at DESC, scoped by branch via RLS.
create index if not exists idx_erp_invoices_branch_created
  on erp_invoices (branch_id, created_at desc);

create index if not exists idx_erp_sales_orders_branch_created
  on erp_sales_orders (branch_id, created_at desc);

create index if not exists idx_erp_purchase_orders_branch_created
  on erp_purchase_orders (branch_id, created_at desc);

create index if not exists idx_erp_sales_returns_branch_created
  on erp_sales_returns (branch_id, created_at desc);

create index if not exists idx_erp_payment_vouchers_branch_created
  on erp_payment_vouchers (branch_id, created_at desc);

create index if not exists idx_erp_receipt_vouchers_branch_created
  on erp_receipt_vouchers (branch_id, created_at desc);

-- Transfers have no branch/company column (keyed by from/to warehouse).
create index if not exists idx_erp_transfer_orders_created
  on erp_transfer_orders (created_at desc);

-- Journal: list orders by entry_date DESC, created_at DESC within a branch.
create index if not exists idx_erp_journal_entries_branch_dates
  on erp_journal_entries (branch_id, entry_date desc, created_at desc);

-- General-ledger traversal: lines for an account, joined back to their entry.
create index if not exists idx_erp_journal_lines_account_entry
  on erp_journal_lines (account_id, journal_entry_id);

-- Per-product stock ledger / FIFO costing walks movements by product over time.
create index if not exists idx_erp_stock_movements_product_created
  on erp_stock_movements (product_id, created_at desc);

-- ── Clinic ─────────────────────────────────────────────────────────────────
create index if not exists idx_erp_clinic_visits_company_date
  on erp_clinic_visits (company_id, visit_date desc);

-- Doctor queue: a doctor's open visits.
create index if not exists idx_erp_clinic_visits_doctor_status
  on erp_clinic_visits (doctor_id, status);

create index if not exists idx_erp_clinic_appts_company_when
  on erp_clinic_appointments (company_id, scheduled_at);

-- ── Pharmacy ───────────────────────────────────────────────────────────────
create index if not exists idx_erp_pharm_disp_company_when
  on erp_pharmacy_dispenses (company_id, dispensed_at desc);

-- ── Hotel ──────────────────────────────────────────────────────────────────
create index if not exists idx_erp_bookings_company_checkin
  on erp_bookings (company_id, check_in desc);

-- ── Restaurant ─────────────────────────────────────────────────────────────
-- Open-orders list: status filter + newest-first within a company.
create index if not exists idx_erp_rest_orders_company_status_created
  on erp_restaurant_orders (company_id, status, created_at desc);

-- Kitchen board: items in a set of kitchen_status values, oldest-first.
create index if not exists idx_erp_rest_items_kitchen
  on erp_restaurant_order_items (kitchen_status, created_at);

-- ── Salon ──────────────────────────────────────────────────────────────────
create index if not exists idx_erp_salon_tickets_company_status_created
  on erp_salon_tickets (company_id, status, created_at desc);

-- ── Laundry ────────────────────────────────────────────────────────────────
create index if not exists idx_erp_laundry_orders_company_status_created
  on erp_laundry_orders (company_id, status, created_at desc);
