-- ============================================================================
-- 0117: Field Governance — config versions, draft/publish, rollback (DFG-2d)
-- ----------------------------------------------------------------------------
-- The live erp_field_config/access/sections remain the WORKING DRAFT (what
-- admins edit). Publishing snapshots the draft into a 'published' version; the
-- resolver reads the published snapshot (with live→registry fallback when none
-- exists — safe defaults preserved). Rollback is NON-DESTRUCTIVE: it republishes
-- an older snapshot as a new version and restores it into the draft; prior
-- versions are retained ('archived'). RLS: read members, write admin.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_field_config_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity       TEXT NOT NULL,
  version_no   INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  snapshot     JSONB NOT NULL,
  label        TEXT,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (company_id, entity, version_no)
);
CREATE INDEX IF NOT EXISTS idx_erp_field_versions_entity ON erp_field_config_versions(company_id, entity);
-- At most one published version per (company, entity).
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_field_versions_published
  ON erp_field_config_versions(company_id, entity) WHERE status = 'published';

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_field_config_versions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_versions_set_company ON erp_field_config_versions';
  EXECUTE 'CREATE TRIGGER erp_field_versions_set_company BEFORE INSERT ON erp_field_config_versions FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_versions_read" ON erp_field_config_versions';
  EXECUTE 'CREATE POLICY "erp_field_versions_read" ON erp_field_config_versions FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_versions_write" ON erp_field_config_versions';
  EXECUTE 'CREATE POLICY "erp_field_versions_write" ON erp_field_config_versions FOR ALL USING (erp_is_platform_owner() OR erp_is_company_admin(company_id)) WITH CHECK (erp_is_platform_owner() OR erp_is_company_admin(company_id))';
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_field_config_versions;
