-- ============================================================================
-- 0202: Global Tax Foundation — legal entities + tax registrations (Phase 5A f/u)
-- ----------------------------------------------------------------------------
-- The taxpayer dimension (proposal §3.1/§3.2): a company may run multiple legal
-- entities, each holding one or more tax registrations. Tax is computed/ledgered/
-- reported per legal entity + registration. This migration:
--   * creates erp_legal_entities + erp_tax_registrations (effective-dated, multi)
--   * backfills ONE primary legal entity per existing company (additive, idempotent)
--   * adds erp_branches.legal_entity_id (nullable) and backfills → primary entity
--   * promotes the placeholder columns added earlier (erp_tax_ledger,
--     erp_document_tax_treatments, erp_tax_determination_rules) to real FKs +
--     covering indexes (those columns are all-NULL / inert, so this is safe)
-- Additive + INERT (no behaviour change; tax stays flag-gated OFF). Company-scoped
-- RLS. Depends on 0005, 0018, 0197, 0199, 0200.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_legal_entities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name          text NOT NULL,
  country       text,
  base_currency text,
  is_default    boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_entities_company ON erp_legal_entities (company_id);

CREATE TABLE IF NOT EXISTS erp_tax_registrations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  legal_entity_id     uuid NOT NULL REFERENCES erp_legal_entities(id) ON DELETE CASCADE,
  country             text NOT NULL,
  regime              text,
  tax_kind            text NOT NULL DEFAULT 'vat' CHECK (tax_kind IN ('vat','excise','withholding','other')),
  registration_number text NOT NULL,
  is_default          boolean NOT NULL DEFAULT false,
  effective_from      date,
  effective_to        date,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_registrations_company ON erp_tax_registrations (company_id);
CREATE INDEX IF NOT EXISTS idx_tax_registrations_entity  ON erp_tax_registrations (legal_entity_id);

ALTER TABLE erp_legal_entities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_tax_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_legal_entities_tenant ON erp_legal_entities;
CREATE POLICY erp_legal_entities_tenant ON erp_legal_entities FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_tax_registrations_tenant ON erp_tax_registrations;
CREATE POLICY erp_tax_registrations_tenant ON erp_tax_registrations FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Backfill: one primary legal entity per company (idempotent) ──────────────
INSERT INTO erp_legal_entities (company_id, name, is_default)
SELECT c.id, c.name, true
FROM erp_companies c
WHERE NOT EXISTS (SELECT 1 FROM erp_legal_entities le WHERE le.company_id = c.id);

-- ── erp_branches.legal_entity_id (additive) + backfill → company primary entity ──
ALTER TABLE erp_branches ADD COLUMN IF NOT EXISTS legal_entity_id uuid;
UPDATE erp_branches b
SET legal_entity_id = le.id
FROM erp_legal_entities le
WHERE le.company_id = b.company_id AND le.is_default AND b.legal_entity_id IS NULL;

-- ── Promote placeholder columns to FKs + covering indexes (cols are NULL/inert) ──
DO $$
BEGIN
  -- covering indexes first (schema-health: first index col = FK col)
  CREATE INDEX IF NOT EXISTS idx_branches_legal_entity        ON erp_branches (legal_entity_id);
  CREATE INDEX IF NOT EXISTS idx_tax_ledger_entity            ON erp_tax_ledger (legal_entity_id);
  CREATE INDEX IF NOT EXISTS idx_tax_ledger_registration      ON erp_tax_ledger (registration_id);
  CREATE INDEX IF NOT EXISTS idx_doc_tax_treatments_entity    ON erp_document_tax_treatments (legal_entity_id);
  CREATE INDEX IF NOT EXISTS idx_tax_determ_entity            ON erp_tax_determination_rules (legal_entity_id);
  CREATE INDEX IF NOT EXISTS idx_tax_determ_registration      ON erp_tax_determination_rules (vat_registration_id);

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_branches_legal_entity') THEN
    ALTER TABLE erp_branches ADD CONSTRAINT fk_branches_legal_entity
      FOREIGN KEY (legal_entity_id) REFERENCES erp_legal_entities(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tax_ledger_entity') THEN
    ALTER TABLE erp_tax_ledger ADD CONSTRAINT fk_tax_ledger_entity
      FOREIGN KEY (legal_entity_id) REFERENCES erp_legal_entities(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tax_ledger_registration') THEN
    ALTER TABLE erp_tax_ledger ADD CONSTRAINT fk_tax_ledger_registration
      FOREIGN KEY (registration_id) REFERENCES erp_tax_registrations(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_doc_treatments_entity') THEN
    ALTER TABLE erp_document_tax_treatments ADD CONSTRAINT fk_doc_treatments_entity
      FOREIGN KEY (legal_entity_id) REFERENCES erp_legal_entities(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tax_determ_entity') THEN
    ALTER TABLE erp_tax_determination_rules ADD CONSTRAINT fk_tax_determ_entity
      FOREIGN KEY (legal_entity_id) REFERENCES erp_legal_entities(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tax_determ_registration') THEN
    ALTER TABLE erp_tax_determination_rules ADD CONSTRAINT fk_tax_determ_registration
      FOREIGN KEY (vat_registration_id) REFERENCES erp_tax_registrations(id) ON DELETE SET NULL;
  END IF;
END $$;
