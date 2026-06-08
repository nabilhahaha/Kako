-- ============================================================================
-- 0200: Global Tax Foundation — tax determination rules engine (Phase 5A · M4c)
-- ----------------------------------------------------------------------------
-- Data-driven rules that AUTOMATICALLY determine a document's tax treatment from
-- the transaction context (proposal §1B) — so manual per-document profile selection
-- is the exception. Match inputs (any nullable = wildcard) → outputs (profile,
-- VAT treatment, code/rate, compliance, country pack, reporting category). Resolved
-- most-specific-wins, deterministic, effective-dated, pack-versioned. Platform/pack
-- defaults are company_id NULL; per-company rows override. Additive + INERT
-- (KAKO_TAX OFF; M6 service runs it). Depends on 0005, 0018, 0198.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_tax_determination_rules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- NULL = platform/pack default
  -- ── match inputs (NULL = wildcard) ────────────────────────────────────────
  country                 text,
  legal_entity_id         uuid,
  vat_registration_id     uuid,
  customer_type           text,
  customer_classification text,
  channel                 text,
  document_type           text,
  product_tax_code        text,
  product_category        text,
  transaction_type        text,
  -- ── outputs ──────────────────────────────────────────────────────────────
  document_tax_profile_id uuid REFERENCES erp_document_tax_profiles(id) ON DELETE RESTRICT,
  vat_treatment           text,
  tax_code                text,
  tax_rate                numeric(7,4),
  compliance_requirement  text,
  country_pack            text,
  reporting_category      text,
  -- ── control ──────────────────────────────────────────────────────────────
  priority                integer NOT NULL DEFAULT 100,
  effective_from          date,
  effective_to            date,
  pack_version            text,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);
-- FK-covering + lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_tax_determ_company  ON erp_tax_determination_rules (company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tax_determ_profile  ON erp_tax_determination_rules (document_tax_profile_id);
CREATE INDEX IF NOT EXISTS idx_tax_determ_country  ON erp_tax_determination_rules (country, document_type);

ALTER TABLE erp_tax_determination_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_tax_determ_read ON erp_tax_determination_rules;
CREATE POLICY erp_tax_determ_read ON erp_tax_determination_rules FOR SELECT
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_tax_determ_manage ON erp_tax_determination_rules;
CREATE POLICY erp_tax_determ_manage ON erp_tax_determination_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
