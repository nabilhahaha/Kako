-- ============================================================================
-- 0101: FMCG hierarchy Slice S1 — Region + Area entities (+ branch links)
-- ----------------------------------------------------------------------------
-- Adds tenant-scoped Region and Area entities and links branches to them, the
-- geographic backbone for the FMCG hierarchy (customer model = S3, scope = S4).
-- ADDITIVE + idempotent. No existing row's meaning changes (branch.region_id /
-- area_id default NULL). RLS + company_id trigger + updated_at, same pattern as
-- erp_departments/erp_teams (0077). Protected verticals untouched.
--
-- NOTE: migration numbers 0099/0100 were already taken (company_trial /
-- subscription_canonical); this slice uses the next free number 0101.
--
-- S1 builds ENTITIES + LINKS ONLY. No hierarchy scope/RLS-by-ownership yet (S4),
-- no new roles (S2), no customer fields (S3). manager_id is kept nullable now and
-- enforced in S4.
-- ============================================================================

-- ── Regions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  manager_id  UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  external_id TEXT,
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_erp_regions_company ON erp_regions(company_id);

-- ── Areas (belong to a region) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  region_id   UUID REFERENCES erp_regions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  manager_id  UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  external_id TEXT,
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_erp_areas_company ON erp_areas(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_areas_region ON erp_areas(region_id);

-- ── Branch links (additive; nullable → existing branches unaffected) ──────────
ALTER TABLE erp_branches ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES erp_regions(id) ON DELETE SET NULL;
ALTER TABLE erp_branches ADD COLUMN IF NOT EXISTS area_id   UUID REFERENCES erp_areas(id)   ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_erp_branches_region ON erp_branches(region_id);
CREATE INDEX IF NOT EXISTS idx_erp_branches_area ON erp_branches(area_id);

-- ── company_id trigger + updated_at + RLS (same pattern as org tables) ────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_regions','erp_areas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
    -- Read: platform owner or same-company. Manage: same (S1 reuses the
    -- settings.branches permission at the app layer; hierarchy ownership = S4).
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;
