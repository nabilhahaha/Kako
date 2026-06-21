-- 0365: Platform Owner — richer company provisioning fields.
--
-- Additive, nullable / defaulted columns on the shared erp_companies table so the
-- VANTORA Platform Admin Console can capture a company's city, an explicit trial
-- start date, and a pilot flag at creation time. Safe for every existing tenant
-- (full-ERP or Route Planner): the columns are optional and default to inert
-- values, so no current behaviour changes.
--
-- Per-company feature enablement reuses the EXISTING erp_company_modules table
-- (company_id, module, enabled) — the same store the ERP navigation already gates
-- on via auth-context. No new feature/module model is introduced here.

ALTER TABLE erp_companies
  ADD COLUMN IF NOT EXISTS city            text,
  ADD COLUMN IF NOT EXISTS trial_starts_at date,
  ADD COLUMN IF NOT EXISTS is_pilot        boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN erp_companies.city            IS 'City / region of the company HQ (provisioning metadata).';
COMMENT ON COLUMN erp_companies.trial_starts_at IS 'Explicit trial start date set at provisioning (trial_ends_at is the end).';
COMMENT ON COLUMN erp_companies.is_pilot        IS 'Pilot-active flag — a managed pilot engagement (distinct from trial/active).';
