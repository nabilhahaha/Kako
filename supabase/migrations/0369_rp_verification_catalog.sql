-- ============================================================================
-- 0369 — Field Customer Verification: admin-managed City/Channel catalog (ADDITIVE,
-- idempotent). City and Channel are company-admin-defined dropdown lists — NOT derived
-- from uploaded data and NEVER free-typed. Field users read the ACTIVE values; only the
-- Company Admin writes. The rep's selected values are saved as new_city / new_channel on
-- the verification record; imported customer city/channel remain old/current only.
-- Staging only. Reverse: DROP TABLE IF EXISTS erp_rp_verification_catalog;
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rp_verification_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id)  ON DELETE CASCADE,
  kind        text NOT NULL,                 -- 'city' | 'channel'
  value       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,  -- soft-disable instead of delete
  updated_by  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_verif_catalog_kind_chk CHECK (kind IN ('city','channel')),
  CONSTRAINT uq_rp_verif_catalog UNIQUE (company_id, kind, value)
);
-- uq_rp_verif_catalog's first column (company_id) covers the company_id FK;
-- updated_by gets its own covering index (repo convention: every FK has a covering index).
CREATE INDEX IF NOT EXISTS idx_rp_verif_catalog_updated_by ON erp_rp_verification_catalog (updated_by);
CREATE INDEX IF NOT EXISTS idx_rp_verif_catalog_lookup     ON erp_rp_verification_catalog (company_id, kind, active, sort_order);

ALTER TABLE erp_rp_verification_catalog ENABLE ROW LEVEL SECURITY;
-- read: any company member (field users need the active lists)
DROP POLICY IF EXISTS rp_verif_catalog_sel ON erp_rp_verification_catalog;
CREATE POLICY rp_verif_catalog_sel ON erp_rp_verification_catalog FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin() OR company_id = erp_user_company_id());
-- write: company admin only
DROP POLICY IF EXISTS rp_verif_catalog_wr ON erp_rp_verification_catalog;
CREATE POLICY rp_verif_catalog_wr ON erp_rp_verification_catalog FOR ALL
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
  WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)));
