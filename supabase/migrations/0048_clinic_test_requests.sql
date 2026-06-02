-- ============================================================================
-- 0048: Clinic — lab / radiology requests on a visit
-- ----------------------------------------------------------------------------
-- The doctor can request investigations (lab tests / X-ray / imaging), written
-- one per line like the prescription. Printed as a separate request sheet the
-- patient takes to the lab. Nullable, additive. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_clinic_visits
  ADD COLUMN IF NOT EXISTS tests TEXT;
