-- ============================================================================
-- 0350: Customer-level visit frequency + source tracking (FR-2)
-- ----------------------------------------------------------------------------
-- Establishes customer-level visit-frequency STORAGE so it can become the
-- primary source of truth (FR design), with classification (A/B/C) demoted to a
-- recommendation. ADDITIVE + idempotent ONLY:
--   * every column is ADD COLUMN IF NOT EXISTS, nullable, no row-rewriting
--     default → NO existing customer row changes meaning;
--   * NO backfill — existing tenants keep deriving frequency from classification
--     exactly as today until they set a customer-level value;
--   * NO RLS change (erp_customers / erp_companies inherit their tenant policy);
--   * the company override flag defaults to FALSE → classification still only
--     fills gaps, never overrides a customer-specific frequency.
--
-- visit_frequency stores the canonical token from the FR-1 value model
-- (weekly|biweekly|monthly|annual or unit/everyN/visitsPerCycle, e.g. week/1/3).
-- visit_frequency_meta carries forward-compat detail for annual/custom cadences.
-- visit_frequency_source records provenance for audit + "recommended vs actual".
-- ============================================================================

-- ── Customer columns (all nullable, additive) ───────────────────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS visit_frequency        TEXT;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS visit_frequency_source TEXT;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS visit_frequency_meta   JSONB;

-- Provenance is constrained to the known sources (NULL allowed = unset). Added
-- via a guarded DO block so the migration stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'erp_customers_visit_frequency_source_chk'
  ) THEN
    ALTER TABLE erp_customers
      ADD CONSTRAINT erp_customers_visit_frequency_source_chk
      CHECK (visit_frequency_source IS NULL
             OR visit_frequency_source IN ('manual', 'import', 'classification', 'system'));
  END IF;
END $$;

-- ── Company override policy (default FALSE = no behaviour change) ────────────
-- When FALSE (default), classification recommendation only fills gaps and never
-- overrides a customer-level frequency. A company may set TRUE to explicitly let
-- A/B/C classification supersede customer-level values.
ALTER TABLE erp_companies
  ADD COLUMN IF NOT EXISTS journey_classification_overrides_frequency BOOLEAN NOT NULL DEFAULT false;
