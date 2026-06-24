-- ============================================================================
-- 0375: Field Verification — record whether the GPS/radius lock was ENFORCED for each
-- submitted verification. The admin toggle already exists (Form Builder requireGps); this
-- adds an immutable, per-row flag so the completed detail + reports can clearly show
-- "Submitted without radius enforcement" when the admin had radius validation OFF.
--
-- Additive + nullable: legacy rows keep NULL, which the app treats as ENFORCED (today's
-- behavior). No data rewrite, no destructive change. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_rp_customer_verifications
  ADD COLUMN IF NOT EXISTS radius_enforced boolean;
