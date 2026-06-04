-- ============================================================================
-- 0136: Enterprise Readiness — SAFE auto-remediation (additive, non-destructive)
-- ----------------------------------------------------------------------------
-- Only LOW/MEDIUM, approval-free, non-destructive fixes from the readiness review:
--   * additive composite indexes for common company-scoped filters (perf at scale)
--   * default erp_fmcg_settings backfill for companies missing a row (neutralizes
--     the NULL-settings day-close/van-transfer edge cases — they then read real
--     configured values instead of NULL).
-- All CREATE INDEX IF NOT EXISTS / idempotent INSERT. No data is changed or
-- removed. HIGH/CRITICAL findings (RPC guards, SQL-report aggregation, product
-- search, schema redesigns) are intentionally NOT touched here — they require
-- approval per the program guardrails.
-- ============================================================================

-- ── Composite indexes (verified columns only) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_erp_customers_company_status ON erp_customers(company_id, customer_status);
CREATE INDEX IF NOT EXISTS idx_erp_customers_company_active ON erp_customers(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_erp_customer_transfers_company_status_created ON erp_customer_transfers(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_visit_compliance_company_created ON erp_visit_compliance(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_journey_plans_company_day ON erp_journey_plans(company_id, day_of_week) WHERE status = 'active';

-- ── Default FMCG settings backfill (idempotent) ──────────────────────────────
-- Every company gets a settings row with the schema defaults, so the day-close
-- coverage threshold + van auto-approve + GPS radius resolve to real configured
-- values rather than NULL for pre-0128 companies.
INSERT INTO erp_fmcg_settings (company_id)
SELECT c.id FROM erp_companies c
WHERE NOT EXISTS (SELECT 1 FROM erp_fmcg_settings s WHERE s.company_id = c.id);

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS idx_erp_customers_company_status, idx_erp_customers_company_active,
--   idx_erp_customer_transfers_company_status_created, idx_erp_visit_compliance_company_created,
--   idx_erp_journey_plans_company_day;
-- (settings rows left in place; harmless.)
