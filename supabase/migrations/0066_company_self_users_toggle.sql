-- ============================================================================
-- 0066: Per-company switch — allow the tenant to manage its own users
-- ----------------------------------------------------------------------------
-- A single, explicit toggle the platform owner controls per subscriber. When
-- off, the tenant's "فريق العمل" page and staff actions are blocked regardless
-- of role — the vendor manages that company's users instead. Default on
-- (self-service, the SaaS norm). Safe to re-run.
-- ============================================================================

ALTER TABLE erp_companies
  ADD COLUMN IF NOT EXISTS allow_self_users BOOLEAN NOT NULL DEFAULT true;
