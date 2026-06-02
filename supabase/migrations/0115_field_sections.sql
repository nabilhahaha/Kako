-- ============================================================================
-- 0115: Field Governance — section presentation metadata (DFG-2)
-- ----------------------------------------------------------------------------
-- Makes sections first-class so large forms (100+ fields) stay usable: per
-- company + entity, a section carries bilingual label, help text, an icon, a
-- collapsible flag, default expanded/collapsed state, and an explicit order.
-- ADDITIVE: absent row ⇒ a section renders from its key, no icon, expanded,
-- ordered by field sort (today's behavior). RLS: read members, write admin.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_field_sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity            TEXT NOT NULL,
  key               TEXT NOT NULL,           -- matches erp_field_config.section
  label_ar          TEXT,
  label_en          TEXT,
  description_ar    TEXT,
  description_en    TEXT,
  icon              TEXT,                     -- lucide icon name
  collapsible       BOOLEAN NOT NULL DEFAULT true,
  default_collapsed BOOLEAN NOT NULL DEFAULT false,
  sort              INTEGER NOT NULL DEFAULT 0,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity, key)
);
CREATE INDEX IF NOT EXISTS idx_erp_field_sections_entity ON erp_field_sections(company_id, entity);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_field_sections ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_sections_set_company ON erp_field_sections';
  EXECUTE 'CREATE TRIGGER erp_field_sections_set_company BEFORE INSERT ON erp_field_sections FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_sections_updated ON erp_field_sections';
  EXECUTE 'CREATE TRIGGER erp_field_sections_updated BEFORE UPDATE ON erp_field_sections FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_sections_read" ON erp_field_sections';
  EXECUTE 'CREATE POLICY "erp_field_sections_read" ON erp_field_sections FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_sections_write" ON erp_field_sections';
  EXECUTE 'CREATE POLICY "erp_field_sections_write" ON erp_field_sections FOR ALL USING (erp_is_platform_owner() OR erp_is_company_admin(company_id)) WITH CHECK (erp_is_platform_owner() OR erp_is_company_admin(company_id))';
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_field_sections;
