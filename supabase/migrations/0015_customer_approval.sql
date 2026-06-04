-- ============================================================================
-- 0015: Customer approval
-- ----------------------------------------------------------------------------
-- Reps can create customers, but they stay unapproved until a super admin
-- approves them; selling is blocked until then. Existing customers default to
-- approved. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_customers
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_erp_customers_approved ON erp_customers(is_approved);
