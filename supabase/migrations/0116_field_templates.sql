-- ============================================================================
-- 0116: Field Governance — templates + cross-entity/company copy (DFG-2c, Tier A)
-- ----------------------------------------------------------------------------
-- erp_field_templates: a named snapshot ({config, access, sections}) of an
-- entity's governance, reusable across entities/companies. company_id NULL +
-- is_global = a Platform-Owner template available to every company. Copy
-- entity→entity and company→company are server actions over the existing
-- tables (no schema needed for copy). Additive; safe-default preserving.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_field_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID REFERENCES erp_companies(id) ON DELETE CASCADE,  -- NULL = global
  name         TEXT NOT NULL,
  scope_entity TEXT NOT NULL,
  snapshot     JSONB NOT NULL,
  is_global    BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_field_templates_scope ON erp_field_templates(scope_entity);
CREATE INDEX IF NOT EXISTS idx_erp_field_templates_company ON erp_field_templates(company_id);

-- RLS: read own-company + global + platform owner; write own-company (admin) or
-- global (platform owner only). No set_company trigger — the action sets
-- company_id (NULL for global) explicitly.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_field_templates ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_templates_read" ON erp_field_templates';
  EXECUTE 'CREATE POLICY "erp_field_templates_read" ON erp_field_templates FOR SELECT USING (erp_is_platform_owner() OR is_global OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_templates_write" ON erp_field_templates';
  EXECUTE 'CREATE POLICY "erp_field_templates_write" ON erp_field_templates FOR ALL USING (erp_is_platform_owner() OR (NOT is_global AND erp_is_company_admin(company_id))) WITH CHECK (erp_is_platform_owner() OR (NOT is_global AND company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))';
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_field_templates;
