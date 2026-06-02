-- ============================================================================
-- 0099: Company trial period (Platform Owner Control Center)
-- ----------------------------------------------------------------------------
-- Lets the platform owner put a tenant on a timed trial, independent of the paid
-- subscription_end. Additive + idempotent. No RLS change — the existing
-- erp_companies policies (platform owner / company scope) already cover it.
-- A null value means "not on a trial".
-- ============================================================================

ALTER TABLE erp_companies
  ADD COLUMN IF NOT EXISTS trial_ends_at DATE;

COMMENT ON COLUMN erp_companies.trial_ends_at IS
  'Trial period end date set by the platform owner; NULL = not on a trial.';
