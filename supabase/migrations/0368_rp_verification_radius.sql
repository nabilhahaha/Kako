-- ============================================================================
-- 0368 — Field Customer Verification: company-configurable proximity radius + attempt
-- log (ADDITIVE, idempotent). Default radius = 50 m. Company Admin configures per company;
-- field users cannot. Server-side enforcement uses the configured radius; each verification
-- records the allowed_radius_m used; rejected/important attempts are logged for the
-- exception report. Staging only. Reverse: drop the two tables + the added column.
-- ============================================================================

-- 1) per-company radius (default 50; admin-write)
CREATE TABLE IF NOT EXISTS erp_rp_verification_settings (
  company_id uuid PRIMARY KEY REFERENCES erp_companies(id) ON DELETE CASCADE,
  radius_m   int  NOT NULL DEFAULT 50,
  updated_by uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_verif_settings_radius_chk CHECK (radius_m BETWEEN 10 AND 1000)
);
CREATE INDEX IF NOT EXISTS idx_rp_verif_settings_updated_by ON erp_rp_verification_settings (updated_by);

ALTER TABLE erp_rp_verification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rp_verif_settings_sel ON erp_rp_verification_settings;
CREATE POLICY rp_verif_settings_sel ON erp_rp_verification_settings FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS rp_verif_settings_wr ON erp_rp_verification_settings;
CREATE POLICY rp_verif_settings_wr ON erp_rp_verification_settings FOR ALL
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
  WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)));

-- 2) record the radius used at submit time on each verification (additive column)
ALTER TABLE erp_rp_customer_verifications ADD COLUMN IF NOT EXISTS allowed_radius_m int;

-- 3) attempt log (rejected + important attempts → exception report)
CREATE TABLE IF NOT EXISTS erp_rp_verification_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id)            ON DELETE CASCADE,
  customer_id     uuid REFERENCES erp_rp_dataset_customers(id)          ON DELETE SET NULL,
  rep_id          uuid REFERENCES erp_profiles(id)                      ON DELETE SET NULL,
  gps_lat         double precision,
  gps_lng         double precision,
  distance_m      double precision,
  allowed_radius_m int,
  result          text NOT NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_verif_attempt_result_chk CHECK (result IN ('verified','outside_radius','not_assigned','no_coords','error'))
);
CREATE INDEX IF NOT EXISTS idx_rp_attempt_company  ON erp_rp_verification_attempts (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_attempt_customer ON erp_rp_verification_attempts (customer_id);
CREATE INDEX IF NOT EXISTS idx_rp_attempt_rep      ON erp_rp_verification_attempts (rep_id);

ALTER TABLE erp_rp_verification_attempts ENABLE ROW LEVEL SECURITY;
-- read: admin all / own rep / supervisor via reporting graph
DROP POLICY IF EXISTS rp_attempt_sel ON erp_rp_verification_attempts;
CREATE POLICY rp_attempt_sel ON erp_rp_verification_attempts FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rep_id = (select auth.uid())
          OR rp_can_see_user(rep_id, company_id))));
-- insert: a field user logs only their OWN attempt
DROP POLICY IF EXISTS rp_attempt_ins ON erp_rp_verification_attempts;
CREATE POLICY rp_attempt_ins ON erp_rp_verification_attempts FOR INSERT
  WITH CHECK (company_id = erp_user_company_id() AND rep_id = (select auth.uid()));
