-- ============================================================================
-- 0205: E-Invoicing Compliance — certificate store (Phase 5F)
-- ----------------------------------------------------------------------------
-- The certificate STORE ARCHITECTURE for authority e-invoicing (ZATCA CSID,
-- ETA/FTA signing). Country-agnostic, per-company (+ optional legal-entity /
-- registration scope). Holds certificate METADATA + lifecycle and REFERENCES to
-- material held encrypted at rest (csr_ref / material_ref — storage/KMS handles,
-- never inline key bytes). PAUSED scope: certificate issuance, CSR/CSID
-- onboarding, the OTP flow, and production credentials are NOT implemented — this
-- only gives those flows a home to land in later. Additive + INERT until a
-- connector activates. Company-scoped RLS. Depends on 0005, 0018, 0202.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_compliance_certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  legal_entity_id uuid REFERENCES erp_legal_entities(id) ON DELETE SET NULL,
  registration_id uuid REFERENCES erp_tax_registrations(id) ON DELETE SET NULL,
  country         text NOT NULL,
  regime          text NOT NULL,                  -- 'zatca' | 'eta' | 'fta' | ...
  kind            text NOT NULL DEFAULT 'sandbox'
                    CHECK (kind IN ('sandbox','production')),
  label           text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','active','expired','revoked')),
  serial          text,
  subject         text,
  issuer          text,
  fingerprint     text,
  not_before      timestamptz,
  not_after       timestamptz,
  csr_ref         text,                           -- storage/KMS ref to the CSR (not generated here)
  material_ref    text,                           -- storage/KMS ref to encrypted material (never inline keys)
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- FK-covering + lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_compliance_certs_company  ON erp_compliance_certificates (company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_certs_entity   ON erp_compliance_certificates (legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_compliance_certs_regist   ON erp_compliance_certificates (registration_id);
CREATE INDEX IF NOT EXISTS idx_compliance_certs_lookup   ON erp_compliance_certificates (company_id, country, regime, status);

ALTER TABLE erp_compliance_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_compliance_certs_tenant ON erp_compliance_certificates;
CREATE POLICY erp_compliance_certs_tenant ON erp_compliance_certificates FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
