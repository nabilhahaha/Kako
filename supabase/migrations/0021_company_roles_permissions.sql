-- ============================================================================
-- 0021: Per-company roles & permissions
-- ----------------------------------------------------------------------------
-- Lets the platform owner tailor, per tenant company, which roles are active
-- and what each role is allowed to do (a pharmacy != a food distributor != a
-- hotel). Each company is seeded from the global defaults (0017) and can then
-- be trimmed/extended independently. Resolution falls back to the global
-- defaults for any company without its own config. Additive, safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_company_roles (
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  role_key    TEXT NOT NULL REFERENCES erp_roles(key) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, role_key)
);

CREATE TABLE IF NOT EXISTS erp_company_role_permissions (
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  role_key    TEXT NOT NULL REFERENCES erp_roles(key) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  PRIMARY KEY (company_id, role_key, permission)
);

CREATE INDEX IF NOT EXISTS idx_erp_company_roles_company ON erp_company_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_company_role_permissions_company ON erp_company_role_permissions(company_id);

ALTER TABLE erp_company_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_company_role_permissions ENABLE ROW LEVEL SECURITY;

-- Read: platform owner sees all; a user reads only their own company's config
-- (needed so getUserContext can resolve their effective permissions).
DROP POLICY IF EXISTS "erp_company_roles_read" ON erp_company_roles;
CREATE POLICY "erp_company_roles_read" ON erp_company_roles FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS "erp_company_roles_owner" ON erp_company_roles;
CREATE POLICY "erp_company_roles_owner" ON erp_company_roles FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

DROP POLICY IF EXISTS "erp_company_role_permissions_read" ON erp_company_role_permissions;
CREATE POLICY "erp_company_role_permissions_read" ON erp_company_role_permissions FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS "erp_company_role_permissions_owner" ON erp_company_role_permissions;
CREATE POLICY "erp_company_role_permissions_owner" ON erp_company_role_permissions FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

-- ─── Seeding: copy global catalog + default permissions into a company ──────
CREATE OR REPLACE FUNCTION erp_seed_company_roles(p_company_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO erp_company_roles (company_id, role_key, enabled)
  SELECT p_company_id, r.key, true FROM erp_roles r
  ON CONFLICT (company_id, role_key) DO NOTHING;

  INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
  SELECT p_company_id, rp.role_key, rp.permission FROM erp_role_permissions rp
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-seed every newly created company.
CREATE OR REPLACE FUNCTION erp_seed_company_roles_trg()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM erp_seed_company_roles(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS erp_companies_seed_roles ON erp_companies;
CREATE TRIGGER erp_companies_seed_roles AFTER INSERT ON erp_companies
  FOR EACH ROW EXECUTE FUNCTION erp_seed_company_roles_trg();

-- Backfill existing companies.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM erp_companies LOOP
    PERFORM erp_seed_company_roles(c.id);
  END LOOP;
END $$;
