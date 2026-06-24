-- ============================================================================
-- 0380: Multi-Form Field Work — field-work columns on erp_form_responses (ADDITIVE).
--
-- The generic, IMMUTABLE responses table (0240) stores form_id + version + answers.
-- Field-work forms (Market Visit, Competitor Check, Asset Verification, …) also need
-- a few first-class columns for reporting/coverage/export without digging into the
-- answers jsonb. All NULLABLE, all additive; the table stays insert+select only (no
-- UPDATE/DELETE policy is added), so historical submissions are never overwritten.
--
--   status            text         — 'submitted' (default written by the runner)
--   record_code       text         — customer code snapshot (when customer-linked)
--   record_name       text         — customer name snapshot
--   gps_lat / gps_lng double prec.  — capture point (when GPS enabled)
--   distance_m        double prec.  — distance to the customer at submit (if known)
--   allowed_radius_m  integer       — the radius in force at submit (if GPS lock on)
--   radius_enforced   boolean       — was the GPS/radius lock ON for this form
--   photo_ids         uuid[]        — attachment ids (mirrors verifications.inside_photos)
--
-- NOTE: nothing here references the Field Verification tables; FV submissions remain in
-- erp_rp_customer_verifications, untouched. No new FK columns (photo_ids is an array, not
-- a FK), so the schema-health FK-index invariant is unaffected. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_form_responses
  ADD COLUMN IF NOT EXISTS status           text,
  ADD COLUMN IF NOT EXISTS record_code      text,
  ADD COLUMN IF NOT EXISTS record_name      text,
  ADD COLUMN IF NOT EXISTS gps_lat          double precision,
  ADD COLUMN IF NOT EXISTS gps_lng          double precision,
  ADD COLUMN IF NOT EXISTS distance_m       double precision,
  ADD COLUMN IF NOT EXISTS allowed_radius_m integer,
  ADD COLUMN IF NOT EXISTS radius_enforced  boolean,
  ADD COLUMN IF NOT EXISTS photo_ids        uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Reporting lookups: per-form by submitter (rep) and by linked customer.
CREATE INDEX IF NOT EXISTS idx_form_responses_form_creator
  ON erp_form_responses (company_id, form_id, created_by);
CREATE INDEX IF NOT EXISTS idx_form_responses_record
  ON erp_form_responses (company_id, form_id, record_id);

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- ALTER TABLE erp_form_responses
--   DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS record_code,
--   DROP COLUMN IF EXISTS record_name, DROP COLUMN IF EXISTS gps_lat,
--   DROP COLUMN IF EXISTS gps_lng, DROP COLUMN IF EXISTS distance_m,
--   DROP COLUMN IF EXISTS allowed_radius_m, DROP COLUMN IF EXISTS radius_enforced,
--   DROP COLUMN IF EXISTS photo_ids;
