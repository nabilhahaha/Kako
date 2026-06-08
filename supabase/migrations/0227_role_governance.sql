-- ============================================================================
-- 0227: Dynamic Role Governance — data scope / approval authority / temporary
-- access / Entity-360 section security (Phase 7)
-- ----------------------------------------------------------------------------
-- Enterprise dynamic governance layered over the existing role permissions
-- (0021/0125) + field governance (0114): per-role DATA SCOPE (own/team/area/
-- region/branch/company/custom), configurable APPROVAL AUTHORITY thresholds,
-- effective-dated TEMPORARY ACCESS grants (auto-expiry), and Entity-360 SECTION
-- visibility. Additive + INERT until KAKO_ROLE_GOVERNANCE is on. Company-scoped
-- RLS. Field-level security reuses erp_field_access (0114). Depends on 0005, 0018.
-- ============================================================================

-- Per-role data visibility scope (per entity).
CREATE TABLE IF NOT EXISTS erp_role_data_scopes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  role_key      text NOT NULL,
  entity        text NOT NULL,     -- 'customer'|'sales'|'collection'|...
  scope         text NOT NULL CHECK (scope IN ('own','team','area','region','branch','company','custom')),
  custom_filter jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, role_key, entity)
);
CREATE INDEX IF NOT EXISTS idx_role_data_scopes_company ON erp_role_data_scopes (company_id, role_key);
ALTER TABLE erp_role_data_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_role_data_scopes_tenant ON erp_role_data_scopes;
CREATE POLICY erp_role_data_scopes_tenant ON erp_role_data_scopes FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Approval authority thresholds (by amount / discount% / credit / promo budget).
CREATE TABLE IF NOT EXISTS erp_approval_authority_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  dimension      text NOT NULL CHECK (dimension IN ('amount','discount_pct','credit_limit','promotion_budget')),
  threshold      numeric(16,4) NOT NULL,
  authority_role text NOT NULL,
  region         text,
  customer_type  text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_authority_company ON erp_approval_authority_rules (company_id, dimension, is_active);
ALTER TABLE erp_approval_authority_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_approval_authority_tenant ON erp_approval_authority_rules;
CREATE POLICY erp_approval_authority_tenant ON erp_approval_authority_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Temporary access grants (effective-dated; auto-expire by time).
CREATE TABLE IF NOT EXISTS erp_temporary_access_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  grant_key      text NOT NULL,         -- role or permission key
  effective_from timestamptz NOT NULL,
  effective_to   timestamptz NOT NULL,
  reason         text,
  granted_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_temp_access_company ON erp_temporary_access_grants (company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_temp_access_window  ON erp_temporary_access_grants (effective_to);
ALTER TABLE erp_temporary_access_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_temp_access_tenant ON erp_temporary_access_grants;
CREATE POLICY erp_temp_access_tenant ON erp_temporary_access_grants FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Entity-360 section visibility per role.
CREATE TABLE IF NOT EXISTS erp_entity360_section_access (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  role_key   text NOT NULL,
  entity     text NOT NULL,        -- 'customer'|'sku'|'route'|'promotion'|'salesman'|...
  section    text NOT NULL,        -- 'orders'|'collections'|'profitability'|...
  visible    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, role_key, entity, section)
);
CREATE INDEX IF NOT EXISTS idx_entity360_section_company ON erp_entity360_section_access (company_id, role_key, entity);
ALTER TABLE erp_entity360_section_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_entity360_section_tenant ON erp_entity360_section_access;
CREATE POLICY erp_entity360_section_tenant ON erp_entity360_section_access FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
