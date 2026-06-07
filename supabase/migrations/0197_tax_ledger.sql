-- ============================================================================
-- 0197: Global Tax Foundation — tax document lines + tax ledger (Phase 5A · M3)
-- ----------------------------------------------------------------------------
-- The persistence the tax engine (M1/M2) writes into:
--   * erp_tax_document_lines — the computed per-line VAT breakdown attached to a
--     source document (invoice/bill/note)
--   * erp_tax_ledger         — the output/input tax sub-ledger that backs VAT
--     returns + reconciliation to the GL VAT control accounts
-- Additive + INERT: nothing writes these until KAKO_TAX is on (the tax service,
-- M6, persists them). Company-scoped RLS. legal_entity_id / registration_id are
-- nullable now (the legal-entity + registration model is a later 5A milestone);
-- FK + backfill added then — kept nullable + un-FK'd here to stay additive.
-- Depends on 0005 (erp_companies), 0018 (erp_user_company_id / erp_is_platform_owner).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_tax_document_lines (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  reference_type          text NOT NULL,                 -- 'invoice' | 'bill' | 'credit_note' | ...
  reference_id            uuid NOT NULL,
  line_no                 integer NOT NULL DEFAULT 0,
  base                    numeric(18,4) NOT NULL DEFAULT 0,
  tax_code                text NOT NULL,
  rate                    numeric(7,4) NOT NULL DEFAULT 0,
  tax_amount              numeric(18,4) NOT NULL DEFAULT 0,
  kind                    text NOT NULL DEFAULT 'standard'
                            CHECK (kind IN ('standard','zero','exempt','out_of_scope','reverse_charge')),
  inclusive               boolean NOT NULL DEFAULT false,
  document_tax_profile_id uuid,                           -- §1A profile (catalog FK added with M4a)
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_doc_lines_company ON erp_tax_document_lines (company_id);
CREATE INDEX IF NOT EXISTS idx_tax_doc_lines_ref     ON erp_tax_document_lines (reference_type, reference_id);

CREATE TABLE IF NOT EXISTS erp_tax_ledger (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  legal_entity_id         uuid,                           -- nullable until the entity model (later 5A milestone)
  registration_id         uuid,                           -- nullable until the registration model
  period                  text NOT NULL,                  -- 'YYYY-MM' filing period
  direction               text NOT NULL CHECK (direction IN ('output','input')),
  tax_code                text NOT NULL,
  base                    numeric(18,4) NOT NULL DEFAULT 0,
  tax                     numeric(18,4) NOT NULL DEFAULT 0,
  document_tax_profile_id uuid,
  reporting_category      text,
  reference_type          text NOT NULL,
  reference_id            uuid NOT NULL,
  status                  text NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','filed','adjusted','cancelled')),
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_company_period ON erp_tax_ledger (company_id, period);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_ref            ON erp_tax_ledger (reference_type, reference_id);

ALTER TABLE erp_tax_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_tax_ledger         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_tax_doc_lines_tenant ON erp_tax_document_lines;
CREATE POLICY erp_tax_doc_lines_tenant ON erp_tax_document_lines FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP POLICY IF EXISTS erp_tax_ledger_tenant ON erp_tax_ledger;
CREATE POLICY erp_tax_ledger_tenant ON erp_tax_ledger FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
