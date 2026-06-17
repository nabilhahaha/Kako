-- ============================================================================
-- 0275 — erp_feature_flags: tenant-configurable capability flags
-- ----------------------------------------------------------------------------
-- Generic, reusable per-tenant feature switches (pharmacy is the first pack;
-- the table/resolver are industry-agnostic). Each row enables/disables one
-- feature (src/lib/erp/feature-catalog.ts) for one company. New tenants start
-- from a template (Lite/Standard/Enterprise) which materialises rows. A feature
-- with no row falls back to the code default (Lite preset) in the app, and to
-- FALSE in SQL business logic (safe default).
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp_feature_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  UNIQUE (company_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_company ON erp_feature_flags (company_id);

ALTER TABLE erp_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_feature_flags_select ON erp_feature_flags;
CREATE POLICY erp_feature_flags_select ON erp_feature_flags
  FOR SELECT USING (
    erp_is_platform_owner() OR erp_is_super_admin() OR company_id = erp_user_company_id()
  );

DROP POLICY IF EXISTS erp_feature_flags_write ON erp_feature_flags;
CREATE POLICY erp_feature_flags_write ON erp_feature_flags
  FOR ALL USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  )
  WITH CHECK (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON erp_feature_flags TO authenticated;
GRANT ALL ON erp_feature_flags TO service_role;

-- SQL helper for business logic inside RPCs (FALSE when unconfigured = safe).
CREATE OR REPLACE FUNCTION erp_feature_enabled(p_company uuid, p_feature text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM erp_feature_flags
      WHERE company_id = p_company AND feature_key = p_feature
        AND (erp_is_platform_owner() OR erp_is_super_admin() OR p_company = erp_user_company_id())),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION erp_feature_enabled(uuid, text) TO authenticated, service_role;
