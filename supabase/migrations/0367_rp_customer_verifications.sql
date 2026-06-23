-- ============================================================================
-- 0367 — Field Customer Verification (ADDITIVE, idempotent). Demo scenario:
-- "Route Planner + Field Customer Verification".
--
-- One verification record per ASSIGNED customer (UNIQUE customer_id → idempotent
-- "verify once"). Captures old→new city/channel/phone, photos (erp_attachments ids),
-- GPS + distance, rep, timestamp, status. Company-scoped + RLS (admin all; rep own;
-- supervisor via the RP reporting graph). NO existing table is altered.
-- Reverse:  DROP TABLE IF EXISTS erp_rp_customer_verifications;
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rp_customer_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id)            ON DELETE CASCADE,
  dataset_id    uuid REFERENCES erp_rp_datasets(id)                   ON DELETE SET NULL,
  customer_id   uuid REFERENCES erp_rp_dataset_customers(id)          ON DELETE CASCADE,
  customer_code text,
  customer_name text,
  rep_id        uuid REFERENCES erp_profiles(id)                      ON DELETE SET NULL,  -- assigned/verifying rep
  status        text NOT NULL DEFAULT 'verified',
  -- tracked old→new values (old = snapshot from the customer master at submit time)
  old_city      text, new_city    text,
  old_channel   text, new_channel text,
  old_phone     text, new_phone   text,
  -- photos: references to erp_attachments (no binary here)
  outside_photo uuid REFERENCES erp_attachments(id)                   ON DELETE SET NULL,  -- REQUIRED at app layer
  inside_photos uuid[] NOT NULL DEFAULT '{}',
  -- where the rep stood when verifying + distance from the customer (server-validated)
  gps_lat       double precision,
  gps_lng       double precision,
  distance_m    double precision,
  notes         text,
  verified_by   uuid REFERENCES erp_profiles(id)                      ON DELETE SET NULL,
  verified_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_verif_status_chk   CHECK (status IN ('verified','pending')),
  CONSTRAINT uq_rp_verif_customer  UNIQUE (customer_id)   -- one verification per assigned customer
);

CREATE INDEX IF NOT EXISTS idx_rp_verif_company ON erp_rp_customer_verifications (company_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_verif_rep     ON erp_rp_customer_verifications (rep_id);
CREATE INDEX IF NOT EXISTS idx_rp_verif_dataset ON erp_rp_customer_verifications (dataset_id);

ALTER TABLE erp_rp_customer_verifications ENABLE ROW LEVEL SECURITY;

-- Read: platform/super; else company-scoped AND (company admin | own rep row | visible via reporting graph)
DROP POLICY IF EXISTS rp_verif_sel ON erp_rp_customer_verifications;
CREATE POLICY rp_verif_sel ON erp_rp_customer_verifications FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rep_id = (select auth.uid())
          OR rp_can_see_user(rep_id, company_id))));

-- Insert: company-scoped; the author must be the signed-in user; rep submits their OWN row (or admin)
DROP POLICY IF EXISTS rp_verif_ins ON erp_rp_customer_verifications;
CREATE POLICY rp_verif_ins ON erp_rp_customer_verifications FOR INSERT
  WITH CHECK (company_id = erp_user_company_id()
    AND verified_by = (select auth.uid())
    AND (erp_is_company_admin(company_id) OR rep_id = (select auth.uid())));

-- Update: company admin or the row's author (rep can amend their own); company-scoped
DROP POLICY IF EXISTS rp_verif_upd ON erp_rp_customer_verifications;
CREATE POLICY rp_verif_upd ON erp_rp_customer_verifications FOR UPDATE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
    AND (erp_is_company_admin(company_id) OR verified_by = (select auth.uid()))))
  WITH CHECK (company_id = erp_user_company_id());

-- Delete: company admin / platform only (no rep/field deletes)
DROP POLICY IF EXISTS rp_verif_del ON erp_rp_customer_verifications;
CREATE POLICY rp_verif_del ON erp_rp_customer_verifications FOR DELETE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)));
