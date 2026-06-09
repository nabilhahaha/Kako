-- ============================================================================
-- 0263: Module & Feature Entitlement Engine — E1: foundation
-- ----------------------------------------------------------------------------
-- A platform-level entitlement layer. erp_modules + erp_features are the GLOBAL
-- catalog (modules/engines/packs and their features). erp_company_entitlements is
-- the PLATFORM-OWNER-set per-company enablement (+ subscription limits).
-- erp_user_permission_overrides are per-user grant/deny (company-scoped).
--
-- ADDITIVE + INERT until KAKO_ENTITLEMENTS. RLS on every table; NO existing policy,
-- table, or auth/permission behavior is changed. The new permission GATE wraps
-- hasPermission additively (E3); the auth-resolution integration is a later,
-- approval-gated step. See docs/architecture/platform/ENTITLEMENT-ENGINE-DESIGN.md.
-- ============================================================================

-- ── Module / engine / pack catalog (global; read-all, platform-owner write) ──
CREATE TABLE IF NOT EXISTS erp_modules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key         text NOT NULL UNIQUE,
  label_en           text NOT NULL,
  label_ar           text,
  category           text NOT NULL DEFAULT 'core'
                       CHECK (category IN ('core', 'engine', 'vertical', 'pack')),
  parent_module_key  text,
  platform_flag      text,                  -- e.g. 'KAKO_VAN_SALES' (engine gate)
  manage_permission  text,                  -- permission to administer it
  sort               integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE erp_modules ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_modules_updated ON erp_modules;
CREATE TRIGGER erp_modules_updated BEFORE UPDATE ON erp_modules FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_modules_read ON erp_modules;
CREATE POLICY erp_modules_read ON erp_modules FOR SELECT USING (true);
DROP POLICY IF EXISTS erp_modules_write ON erp_modules;
CREATE POLICY erp_modules_write ON erp_modules FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

-- ── Features within a module (global) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_features (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key   text NOT NULL REFERENCES erp_modules(module_key) ON DELETE CASCADE,
  feature_key  text NOT NULL,
  label_en     text NOT NULL,
  label_ar     text,
  permission   text,
  settings_ref text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_features_module_feature ON erp_features (module_key, feature_key);
ALTER TABLE erp_features ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_features_updated ON erp_features;
CREATE TRIGGER erp_features_updated BEFORE UPDATE ON erp_features FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_features_read ON erp_features;
CREATE POLICY erp_features_read ON erp_features FOR SELECT USING (true);
DROP POLICY IF EXISTS erp_features_write ON erp_features;
CREATE POLICY erp_features_write ON erp_features FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

-- ── Per-company entitlements (platform-owner set; company reads) ─────────────
CREATE TABLE IF NOT EXISTS erp_company_entitlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  module_key   text NOT NULL,
  feature_key  text,                        -- NULL = module-level entitlement
  is_enabled   boolean NOT NULL DEFAULT false,
  limit_value  integer,                     -- optional subscription limit
  limit_period text,                        -- e.g. 'month' (NULL = absolute)
  expires_at   timestamptz,
  notes        text,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_entitlements
  ON erp_company_entitlements (company_id, module_key, COALESCE(feature_key, ''));
ALTER TABLE erp_company_entitlements ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_company_entitlements_set_company ON erp_company_entitlements;
CREATE TRIGGER erp_company_entitlements_set_company BEFORE INSERT ON erp_company_entitlements
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_company_entitlements_updated ON erp_company_entitlements;
CREATE TRIGGER erp_company_entitlements_updated BEFORE UPDATE ON erp_company_entitlements
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
-- Read: platform owner + the company. Write: platform owner only (company-admin
-- feature-level writes are added — capped at the module entitlement — in E5).
DROP POLICY IF EXISTS erp_company_entitlements_read ON erp_company_entitlements;
CREATE POLICY erp_company_entitlements_read ON erp_company_entitlements FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_company_entitlements_write ON erp_company_entitlements;
CREATE POLICY erp_company_entitlements_write ON erp_company_entitlements FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

-- ── Per-user permission overrides (company-scoped grant/deny) ────────────────
CREATE TABLE IF NOT EXISTS erp_user_permission_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  permission     text NOT NULL,
  grant_type     text NOT NULL DEFAULT 'grant' CHECK (grant_type IN ('grant', 'deny')),
  reason         text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  is_active      boolean NOT NULL DEFAULT true,
  granted_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_perm_overrides
  ON erp_user_permission_overrides (company_id, user_id, permission, grant_type);
CREATE INDEX IF NOT EXISTS idx_user_perm_overrides_user ON erp_user_permission_overrides (company_id, user_id);
ALTER TABLE erp_user_permission_overrides ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_user_perm_overrides_set_company ON erp_user_permission_overrides;
CREATE TRIGGER erp_user_perm_overrides_set_company BEFORE INSERT ON erp_user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_user_perm_overrides_updated ON erp_user_permission_overrides;
CREATE TRIGGER erp_user_perm_overrides_updated BEFORE UPDATE ON erp_user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_user_perm_overrides_tenant ON erp_user_permission_overrides;
CREATE POLICY erp_user_perm_overrides_tenant ON erp_user_permission_overrides FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual): DROP TABLE IF EXISTS erp_user_permission_overrides,
--    erp_company_entitlements, erp_features, erp_modules; ─────────────────────
