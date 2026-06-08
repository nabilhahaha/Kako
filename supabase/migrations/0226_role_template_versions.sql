-- ============================================================================
-- 0226: Role Template Versioning & Override Policy (Phase 7) — MANDATORY policy
-- ----------------------------------------------------------------------------
-- Platform role templates become VERSIONED (Salesman v1/v2/v3). Each company
-- records which version it ADOPTED, so the Platform Owner sees current / latest /
-- upgrade-available per company (RULE 7). Platform template edits create a NEW
-- version and affect NEW companies only (RULES 3/4); existing companies upgrade
-- EXPLICITLY (RULE 6); company overrides live in erp_company_role_permissions
-- (0021) and SURVIVE upgrades (RULE 8, enforced by the pure upgrade engine).
-- Additive + INERT until KAKO_ROLE_VERSIONING is on. Depends on 0005, 0018.
-- ============================================================================

-- Versioned platform role templates (global; no company_id — these are templates).
CREATE TABLE IF NOT EXISTS erp_role_template_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key     text NOT NULL,
  version_no   integer NOT NULL,
  status       text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  label        text,
  snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- permissions / data_scope / actions / approvals / field_visibility
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (role_key, version_no)
);
CREATE INDEX IF NOT EXISTS idx_role_template_versions_role ON erp_role_template_versions (role_key, status);
ALTER TABLE erp_role_template_versions ENABLE ROW LEVEL SECURITY;
-- Templates are global defaults: readable by all authenticated; writable by the platform owner only.
DROP POLICY IF EXISTS erp_role_template_versions_read ON erp_role_template_versions;
CREATE POLICY erp_role_template_versions_read ON erp_role_template_versions FOR SELECT USING (true);
DROP POLICY IF EXISTS erp_role_template_versions_write ON erp_role_template_versions;
CREATE POLICY erp_role_template_versions_write ON erp_role_template_versions FOR ALL
  USING (erp_is_platform_owner())
  WITH CHECK (erp_is_platform_owner());

-- Per-company adopted template version (drives current / latest / upgrade-available).
CREATE TABLE IF NOT EXISTS erp_company_role_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  role_key        text NOT NULL,
  adopted_version integer NOT NULL,
  adopted_at      timestamptz NOT NULL DEFAULT now(),
  adopted_by      uuid,
  UNIQUE (company_id, role_key)
);
CREATE INDEX IF NOT EXISTS idx_company_role_versions_company ON erp_company_role_versions (company_id);
ALTER TABLE erp_company_role_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_company_role_versions_tenant ON erp_company_role_versions;
CREATE POLICY erp_company_role_versions_tenant ON erp_company_role_versions FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
