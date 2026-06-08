-- ============================================================================
-- 0199: Global Tax Foundation — document tax treatment cascade (Phase 5A · M4b)
-- ----------------------------------------------------------------------------
-- The cascade-resolution rows that pick a document tax profile per the §1A.1
-- hierarchy Company → Legal Entity → Customer → Document Type (most-specific wins).
-- Each non-null match dimension narrows the rule; the resolved profile is stamped
-- on the document (additive nullable erp_invoices.document_tax_profile_id).
-- Additive + INERT: nothing writes/reads until KAKO_TAX is on (M6 service resolves
-- + stamps). Company-scoped RLS; effective-dated. legal_entity_id nullable/un-FK'd
-- until the entity model (later milestone). Depends on 0005, 0018, 0198.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_document_tax_treatments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  legal_entity_id         uuid,                                              -- nullable = wildcard (entity model later)
  customer_id             uuid REFERENCES erp_customers(id) ON DELETE CASCADE, -- nullable = wildcard
  document_type           text,                                              -- nullable = wildcard
  document_tax_profile_id uuid NOT NULL REFERENCES erp_document_tax_profiles(id) ON DELETE RESTRICT,
  priority                integer NOT NULL DEFAULT 100,
  effective_from          date,
  effective_to            date,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);
-- FK-covering + resolution-lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_doc_tax_treatments_company  ON erp_document_tax_treatments (company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_doc_tax_treatments_customer ON erp_document_tax_treatments (customer_id);
CREATE INDEX IF NOT EXISTS idx_doc_tax_treatments_profile  ON erp_document_tax_treatments (document_tax_profile_id);

ALTER TABLE erp_document_tax_treatments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_doc_tax_treatments_tenant ON erp_document_tax_treatments;
CREATE POLICY erp_doc_tax_treatments_tenant ON erp_document_tax_treatments FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Document stamp (additive nullable; resolved profile persisted per document) ──
ALTER TABLE erp_invoices ADD COLUMN IF NOT EXISTS document_tax_profile_id uuid;
