-- ============================================================================
-- 0144: Retail Execution Core — Dynamic MSL Matrix Engine + Surveys
-- ----------------------------------------------------------------------------
-- Additive, company-scoped (RLS). NOTHING about the MSL matrix is hardcoded:
-- dimensions (channel / sub-channel / class / brand / future), the values within
-- them, the MSL levels, and the rules are ALL company master data. Adding,
-- renaming or reorganizing channels/classes/levels/rules needs ZERO code change.
-- Industry-agnostic (FMCG / Pharma / Beverage / Dairy / Bakery / future packs).
--
-- Model:
--   erp_customer_lookups  : dynamic DIMENSION VALUES (kind = the dimension; now
--                           free-text so companies define their own dimensions)
--   erp_customer_attributes: an outlet's dynamic attribute values (lookup ids)
--   erp_msl_levels        : dynamic MSL levels (code/name + scoring weight)
--   erp_msl_policies      : company MSL policies (enable/disable, effective window,
--                           priority)
--   erp_msl_policy_conditions : dynamic targeting (lookup ids; AND across kinds,
--                               OR within a kind) — no conditions = company-wide
--   erp_msl_policy_items  : dynamic SKU assignment (+ level / weight override)
--   erp_surveys / erp_survey_responses : in-store surveys (Perfect Store)
--
-- Drift-safe: ships behind defensive empty states; degrades gracefully until
-- applied through the staged Drift Closure process. Safe to re-run.
-- ============================================================================

-- ── 0. Make customer-lookup dimensions fully dynamic (free-text kind) ────────
-- Was CHECK (kind IN ('segment','classification','channel')). Drop it so a company
-- can add 'sub_channel', 'brand', 'outlet_type', or any future dimension with no
-- code change. The (company_id, kind, code) uniqueness still applies.
ALTER TABLE erp_customer_lookups DROP CONSTRAINT IF EXISTS erp_customer_lookups_kind_check;

-- ── 1. Flexible outlet attributes (dynamic dimensions beyond the 3 fixed FKs) ─
CREATE TABLE IF NOT EXISTS erp_customer_attributes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  lookup_id   UUID NOT NULL REFERENCES erp_customer_lookups(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, lookup_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_customer_attributes_customer ON erp_customer_attributes(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_customer_attributes_lookup   ON erp_customer_attributes(lookup_id);

-- ── 2. Dynamic MSL levels (replaces any hardcoded core/extended tier) ────────
CREATE TABLE IF NOT EXISTS erp_msl_levels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  weight      NUMERIC NOT NULL DEFAULT 1,          -- scoring weight for this level
  sort        INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_erp_msl_levels_company ON erp_msl_levels(company_id, is_active);

-- ── 3. MSL policies (the matrix cells) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_msl_policies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  name_ar        TEXT,
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_to   DATE,
  priority       INTEGER NOT NULL DEFAULT 0,        -- higher wins on SKU conflict
  created_by     UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,
  updated_by     UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_msl_policies_company ON erp_msl_policies(company_id, is_active);

-- ── 4. Policy targeting — dynamic lookup conditions ──────────────────────────
-- Each row = one allowed dimension VALUE (lookup). The engine groups by the
-- lookup's kind: AND across kinds, OR within a kind. No rows = company-wide.
CREATE TABLE IF NOT EXISTS erp_msl_policy_conditions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  policy_id   UUID NOT NULL REFERENCES erp_msl_policies(id) ON DELETE CASCADE,
  lookup_id   UUID NOT NULL REFERENCES erp_customer_lookups(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_id, lookup_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_msl_conditions_policy ON erp_msl_policy_conditions(policy_id);

-- ── 5. Policy SKUs — dynamic assignment + weighted scoring + level ───────────
CREATE TABLE IF NOT EXISTS erp_msl_policy_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  policy_id   UUID NOT NULL REFERENCES erp_msl_policies(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  level_id    UUID REFERENCES erp_msl_levels(id) ON DELETE SET NULL,
  weight      NUMERIC,                              -- overrides the level weight when set
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_msl_items_policy  ON erp_msl_policy_items(policy_id);
CREATE INDEX IF NOT EXISTS idx_erp_msl_items_product ON erp_msl_policy_items(product_id);

-- ── 6. Surveys (templates) + responses (Perfect Store) ───────────────────────
CREATE TABLE IF NOT EXISTS erp_surveys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  description TEXT,
  questions   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{key,label,label_ar,type,options?,weight?,required?,max?}]
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_surveys_company ON erp_surveys(company_id, is_active);

CREATE TABLE IF NOT EXISTS erp_survey_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  survey_id   UUID NOT NULL REFERENCES erp_surveys(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  visit_id    UUID REFERENCES erp_visits(id) ON DELETE SET NULL,
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb,
  score       NUMERIC(5,2),
  created_by  UUID REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_survey_responses_company  ON erp_survey_responses(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_survey_responses_customer ON erp_survey_responses(customer_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Master data (attributes, levels, policies, conditions, items, surveys): read by
-- any company member, write by company admin (requirement #10 self-management).
-- Survey responses: read + write by any company member (field reps submit).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'erp_customer_attributes','erp_msl_levels','erp_msl_policies',
    'erp_msl_policy_conditions','erp_msl_policy_items','erp_surveys'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING ((SELECT erp_is_platform_owner()) OR company_id = (SELECT erp_user_company_id()))',
      t||'_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING ((SELECT erp_is_platform_owner()) OR (SELECT erp_is_company_admin(company_id))) WITH CHECK ((SELECT erp_is_platform_owner()) OR (SELECT erp_is_company_admin(company_id)))',
      t||'_write', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_set_company', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t||'_set_company', t);
  END LOOP;
END $$;

ALTER TABLE erp_survey_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_survey_responses_read ON erp_survey_responses;
CREATE POLICY erp_survey_responses_read ON erp_survey_responses
  FOR SELECT USING ((SELECT erp_is_platform_owner()) OR company_id = (SELECT erp_user_company_id()));
DROP POLICY IF EXISTS erp_survey_responses_write ON erp_survey_responses;
CREATE POLICY erp_survey_responses_write ON erp_survey_responses
  FOR ALL USING ((SELECT erp_is_platform_owner()) OR company_id = (SELECT erp_user_company_id()))
  WITH CHECK ((SELECT erp_is_platform_owner()) OR company_id = (SELECT erp_user_company_id()));
DROP TRIGGER IF EXISTS erp_survey_responses_set_company ON erp_survey_responses;
CREATE TRIGGER erp_survey_responses_set_company BEFORE INSERT ON erp_survey_responses
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

-- updated_at touch triggers on the editable master tables.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_msl_levels','erp_msl_policies','erp_surveys'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_updated', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t||'_updated', t);
  END LOOP;
END $$;

-- Rollback (manual): DROP the six erp_msl_*/survey tables + erp_customer_attributes;
-- (the dropped kind CHECK is intentionally left relaxed.)
