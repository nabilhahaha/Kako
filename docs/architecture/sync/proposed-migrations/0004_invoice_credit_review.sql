-- ============================================================================
-- PROPOSED MIGRATION — REVIEW ONLY. DO NOT APPLY AUTOMATICALLY.
--
-- Offline-order reconciliation credit policy (§19): a sale already made in the
-- field is never rejected for over-credit. When the customer exceeded their
-- credit limit before the order synced, the reconciliation worker materializes
-- the invoice as a DRAFT flagged for review (no stock-out / no AR posting) and
-- records reason='credit-review' on the ledger; finance reviews and issues it.
--
-- This column is the visible flag on the order itself. Additive + safe (default
-- false → no behaviour change for existing/online invoices). Validate on a branch.
-- ============================================================================

alter table public.erp_invoices
  add column if not exists requires_credit_review boolean not null default false;

-- Optional: surface the queue quickly in the sales UI / credit dashboard.
create index if not exists erp_invoices_credit_review_idx
  on public.erp_invoices (branch_id) where (requires_credit_review = true);
