-- ============================================================================
-- 0203: Global Tax Foundation — e-invoice submission lifecycle (Phase 5B)
-- ----------------------------------------------------------------------------
-- Country-pack hardening: the submission record every country pack (Egypt ETA,
-- Saudi ZATCA, …) drives a document through (proposal §2/§2.1). Generic + country-
-- agnostic: the pack + pack_version pin makes regeneration reproducible; status is
-- the lifecycle the pure state machine (packs/submission.ts) enforces. Additive +
-- INERT: nothing writes this until a country pack runs (5C+), all flag-gated.
-- Company-scoped RLS; legal_entity/registration FK to 0202. Depends on 0005, 0018,
-- 0202.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_tax_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  legal_entity_id    uuid REFERENCES erp_legal_entities(id) ON DELETE SET NULL,
  registration_id    uuid REFERENCES erp_tax_registrations(id) ON DELETE SET NULL,
  pack               text NOT NULL,                 -- 'eta' | 'zatca' | 'fta' | ...
  pack_version       text,                          -- pinned (§2.1) — reproducible regeneration
  schema_version     text,
  reference_type     text NOT NULL,                 -- source document
  reference_id       uuid NOT NULL,
  document_uuid      text,                          -- authority UUID
  invoice_hash       text,                          -- ZATCA PIH / hash chain
  signature_ref      text,                          -- signed-payload / cert reference (never the key)
  payload_ref        text,                          -- storage ref to the generated payload
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','generated','signed','submitted','cleared','reported','rejected','cancelled')),
  authority_response jsonb,
  attempts           integer NOT NULL DEFAULT 0,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reference_type, reference_id, pack)        -- one submission per document per pack
);
-- FK-covering + lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_tax_submissions_company  ON erp_tax_submissions (company_id, status);
CREATE INDEX IF NOT EXISTS idx_tax_submissions_entity   ON erp_tax_submissions (legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_tax_submissions_regist   ON erp_tax_submissions (registration_id);
CREATE INDEX IF NOT EXISTS idx_tax_submissions_ref      ON erp_tax_submissions (reference_type, reference_id);

ALTER TABLE erp_tax_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_tax_submissions_tenant ON erp_tax_submissions;
CREATE POLICY erp_tax_submissions_tenant ON erp_tax_submissions FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
