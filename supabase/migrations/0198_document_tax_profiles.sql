-- ============================================================================
-- 0198: Global Tax Foundation — document tax profile catalog (Phase 5A · M4a)
-- ----------------------------------------------------------------------------
-- The platform catalog of the 12 document tax profiles (proposal §1A.2). A profile
-- maps a document to a tax KIND (§1) + a COMPLIANCE CLASS the country packs key off
-- (§1A.4). Platform rows (company_id NULL) are the shared catalog; a tenant may add
-- its own. Additive + INERT: nothing references these until KAKO_TAX is on (M4b
-- stamps documents, M4c determination targets them). Depends on 0005/0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_document_tax_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- NULL = platform catalog
  code                  text NOT NULL,
  name                  text NOT NULL,
  tax_kind              text NOT NULL CHECK (tax_kind IN ('standard','zero','exempt','out_of_scope','reverse_charge','none')),
  compliance_class      text NOT NULL DEFAULT 'none' CHECK (compliance_class IN ('e_invoice','e_receipt','simplified','none')),
  is_taxable            boolean NOT NULL DEFAULT false,
  is_note               boolean NOT NULL DEFAULT false,
  requires_original_ref boolean NOT NULL DEFAULT false,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);
-- Unique code per company; a separate partial unique for the global catalog (company_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_tax_profiles_company_code ON erp_document_tax_profiles (company_id, code) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_tax_profiles_global_code  ON erp_document_tax_profiles (code) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_tax_profiles_company ON erp_document_tax_profiles (company_id);

ALTER TABLE erp_document_tax_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_doc_tax_profiles_read ON erp_document_tax_profiles;
CREATE POLICY erp_doc_tax_profiles_read ON erp_document_tax_profiles FOR SELECT
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_doc_tax_profiles_manage ON erp_document_tax_profiles;
CREATE POLICY erp_doc_tax_profiles_manage ON erp_document_tax_profiles FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Seed the 12 platform profiles (company_id NULL; idempotent) ──────────────
INSERT INTO erp_document_tax_profiles (company_id, code, name, tax_kind, compliance_class, is_taxable, is_note, requires_original_ref)
SELECT v.company_id, v.code, v.name, v.tax_kind, v.compliance_class, v.is_taxable, v.is_note, v.requires_original_ref
FROM (VALUES
  (NULL::uuid, 'tax_invoice',            'Tax Invoice',            'standard',     'e_invoice', true,  false, false),
  (NULL::uuid, 'simplified_tax_invoice', 'Simplified Tax Invoice', 'standard',     'simplified', true, false, false),
  (NULL::uuid, 'non_tax_invoice',        'Non-Tax Invoice',        'none',         'none',      false, false, false),
  (NULL::uuid, 'credit_note',            'Credit Note',            'none',         'none',      false, true,  true),
  (NULL::uuid, 'debit_note',             'Debit Note',             'none',         'none',      false, true,  true),
  (NULL::uuid, 'tax_credit_note',        'Tax Credit Note',        'standard',     'e_invoice', true,  true,  true),
  (NULL::uuid, 'tax_debit_note',         'Tax Debit Note',         'standard',     'e_invoice', true,  true,  true),
  (NULL::uuid, 'receipt',                'Receipt',                'none',         'none',      false, false, false),
  (NULL::uuid, 'tax_receipt',            'Tax Receipt',            'standard',     'e_receipt', true,  false, false),
  (NULL::uuid, 'out_of_scope',           'Out Of Scope',           'out_of_scope', 'none',      false, false, false),
  (NULL::uuid, 'zero_rated',             'Zero Rated',             'zero',         'e_invoice', true,  false, false),
  (NULL::uuid, 'exempt',                 'Exempt',                 'exempt',       'none',      false, false, false)
) AS v(company_id, code, name, tax_kind, compliance_class, is_taxable, is_note, requires_original_ref)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_document_tax_profiles p WHERE p.company_id IS NULL AND p.code = v.code
);
