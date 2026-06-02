-- ============================================================================
-- 0114: Dynamic Field Governance (DFG-1) — generic, entity-agnostic engine
-- ----------------------------------------------------------------------------
-- Two per-company tables that overlay the entity registry + erp_custom_fields:
--   erp_field_config  — per-field layout/meta (section, sort, active, sensitive,
--                       protected, default access, inheritance, condition)
--   erp_field_access  — per-subject (role|permission) access matrix
-- `entity` is just a text key, so ONE set of tables governs every entity
-- (customers/suppliers/products/orders/invoices/…). ADDITIVE: with no rows the
-- engine is a no-op overlay → behaves exactly as today. RLS: read by company
-- members; write by company admin / platform owner only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_field_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity         TEXT NOT NULL,
  field_key      TEXT NOT NULL,
  source         TEXT NOT NULL DEFAULT 'core'  CHECK (source IN ('core', 'custom')),
  section        TEXT,
  sort           INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  is_sensitive   BOOLEAN NOT NULL DEFAULT false,
  is_protected   BOOLEAN NOT NULL DEFAULT false,   -- identity/critical: never hidden from admins
  default_access TEXT NOT NULL DEFAULT 'edit' CHECK (default_access IN ('hidden', 'view', 'edit', 'required')),
  inheritance    TEXT NOT NULL DEFAULT 'none' CHECK (inheritance IN ('none', 'inherit', 'inherit_locked')),
  condition      JSONB,                            -- applicability rule {when, op, value}
  label_ar       TEXT,
  label_en       TEXT,
  created_by     UUID,
  updated_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity, field_key)
);
CREATE INDEX IF NOT EXISTS idx_erp_field_config_entity ON erp_field_config(company_id, entity);

CREATE TABLE IF NOT EXISTS erp_field_access (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity       TEXT NOT NULL,
  field_key    TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('role', 'permission')),
  subject_key  TEXT NOT NULL,
  access       TEXT NOT NULL CHECK (access IN ('hidden', 'view', 'edit', 'required')),
  created_by   UUID,
  updated_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity, field_key, subject_type, subject_key)
);
CREATE INDEX IF NOT EXISTS idx_erp_field_access_field ON erp_field_access(company_id, entity, field_key);

-- ── RLS + company_id / updated_at triggers (read: members; write: admin) ──────
DO $$
BEGIN
  -- erp_field_config
  EXECUTE 'ALTER TABLE erp_field_config ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_config_set_company ON erp_field_config';
  EXECUTE 'CREATE TRIGGER erp_field_config_set_company BEFORE INSERT ON erp_field_config FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_config_updated ON erp_field_config';
  EXECUTE 'CREATE TRIGGER erp_field_config_updated BEFORE UPDATE ON erp_field_config FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_config_read" ON erp_field_config';
  EXECUTE 'CREATE POLICY "erp_field_config_read" ON erp_field_config FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_config_write" ON erp_field_config';
  EXECUTE 'CREATE POLICY "erp_field_config_write" ON erp_field_config FOR ALL USING (erp_is_platform_owner() OR erp_is_company_admin(company_id)) WITH CHECK (erp_is_platform_owner() OR erp_is_company_admin(company_id))';

  -- erp_field_access
  EXECUTE 'ALTER TABLE erp_field_access ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_access_set_company ON erp_field_access';
  EXECUTE 'CREATE TRIGGER erp_field_access_set_company BEFORE INSERT ON erp_field_access FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_access_updated ON erp_field_access';
  EXECUTE 'CREATE TRIGGER erp_field_access_updated BEFORE UPDATE ON erp_field_access FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_access_read" ON erp_field_access';
  EXECUTE 'CREATE POLICY "erp_field_access_read" ON erp_field_access FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_field_access_write" ON erp_field_access';
  EXECUTE 'CREATE POLICY "erp_field_access_write" ON erp_field_access FOR ALL USING (erp_is_platform_owner() OR erp_is_company_admin(company_id)) WITH CHECK (erp_is_platform_owner() OR erp_is_company_admin(company_id))';
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_field_access;
-- DROP TABLE IF EXISTS erp_field_config;
