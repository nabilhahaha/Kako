-- ============================================================================
-- 0047: Clinic specialization — patient demographics + visit vital signs
-- ----------------------------------------------------------------------------
-- Makes the clinic vertical a real medical record rather than generic rows:
--   * Patients gain a prominent medical-alert field (allergies / chronic
--     conditions). birth_date already exists (0045) and is now captured.
--   * Visits gain vital signs (temperature, blood pressure, pulse, weight,
--     height) and a follow-up date, so each كشف reads like a clinical note.
-- All columns are nullable and additive. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_patients
  ADD COLUMN IF NOT EXISTS allergies TEXT;

ALTER TABLE erp_clinic_visits
  ADD COLUMN IF NOT EXISTS temperature    NUMERIC,
  ADD COLUMN IF NOT EXISTS blood_pressure TEXT,
  ADD COLUMN IF NOT EXISTS pulse          INTEGER,
  ADD COLUMN IF NOT EXISTS weight         NUMERIC,
  ADD COLUMN IF NOT EXISTS height         NUMERIC,
  ADD COLUMN IF NOT EXISTS followup_date  DATE;
