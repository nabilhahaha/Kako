-- ============================================================================
-- PROPOSED MIGRATION — REVIEW ONLY. DO NOT APPLY AUTOMATICALLY.
--
-- Defensive guard for offline-order reconciliation concurrency. These partial
-- unique indexes are the race backstop that makes invoice + payment
-- materialization safe under concurrent workers / replays / double-submits:
--   * a second worker that lost the race on createInvoiceCore's idempotency_key
--     hits 23505 and returns the winner's invoice (no duplicate sale);
--   * erp_record_payment's `EXCEPTION WHEN unique_violation` no-op depends on the
--     payment index existing.
--
-- They were CONFIRMED PRESENT in the live schema during branch validation
-- (uq_erp_invoices_idem, uq_erp_payments_idem); this migration only guarantees
-- the same invariant in any pilot/preview DB built from a different baseline.
-- IF NOT EXISTS → a no-op where they already exist. Idempotency keys are uuids
-- and nullable (non-idempotent calls), hence the partial predicate.
-- ============================================================================

create unique index if not exists uq_erp_invoices_idem
  on public.erp_invoices (idempotency_key) where (idempotency_key is not null);

create unique index if not exists uq_erp_payments_idem
  on public.erp_payments (idempotency_key) where (idempotency_key is not null);
