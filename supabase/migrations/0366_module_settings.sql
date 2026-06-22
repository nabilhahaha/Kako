-- ============================================================================
-- 0366: Module Configuration / Workflow Settings — foundation (Phase 1)
-- ----------------------------------------------------------------------------
-- Generic, per-company store for configurable module behaviour (POS / Sales /
-- Inventory / Route). One row per (company, module, setting, scope, scope_id).
-- The setting CATALOG (keys, types, defaults, labels, risk) lives in code
-- (src/lib/erp/module-settings-catalog.ts); this table only holds OVERRIDES.
--
-- Phase 1 is a SAFE FOUNDATION: nothing reads these values for enforcement yet,
-- so the table is INERT until a later phase wires it into business logic. Only
-- the 'company' scope is used now; scope/scope_id are future-ready columns for
-- role/user overrides (NOT activated yet). Company-scoped RLS mirrors 0251.
--
-- scope_id is NOT NULL DEFAULT '' (empty = the company-wide row) so the UNIQUE
-- key + upsert onConflict work without NULL-distinct surprises. Additive; no
-- existing table or behaviour is touched.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_module_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  module_key  text NOT NULL,
  setting_key text NOT NULL,
  value       jsonb NOT NULL,
  -- Future-ready scope. Phase 1 only ever writes 'company' with scope_id = ''.
  scope       text NOT NULL DEFAULT 'company' CHECK (scope IN ('company','role','user')),
  scope_id    text NOT NULL DEFAULT '',
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module_key, setting_key, scope, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_module_settings_company ON erp_module_settings (company_id);
CREATE INDEX IF NOT EXISTS idx_module_settings_lookup
  ON erp_module_settings (company_id, module_key, scope);

ALTER TABLE erp_module_settings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS erp_module_settings_set_company ON erp_module_settings;
CREATE TRIGGER erp_module_settings_set_company BEFORE INSERT ON erp_module_settings
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_module_settings_updated ON erp_module_settings;
CREATE TRIGGER erp_module_settings_updated BEFORE UPDATE ON erp_module_settings
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- Read: platform owner (any company) or a member of the owning company.
DROP POLICY IF EXISTS erp_module_settings_read ON erp_module_settings;
CREATE POLICY erp_module_settings_read ON erp_module_settings FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
-- Write: same scoping. Action-layer guards further restrict the surface (Phase 1
-- writes are platform-owner only, via Company 360). RLS is the backstop.
DROP POLICY IF EXISTS erp_module_settings_write ON erp_module_settings;
CREATE POLICY erp_module_settings_write ON erp_module_settings FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual): DROP TABLE IF EXISTS erp_module_settings; ─────────────
