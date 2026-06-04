-- ============================================================================
-- 0145: FMCG Outlet Grading — dynamic grade engine
-- ----------------------------------------------------------------------------
-- Additive, company-scoped (RLS). NOTHING is hardcoded: grade bands (A+/A/B/C/D
-- or any custom set), their score thresholds, and the factor weights are ALL
-- company master data. History tracks every recompute for migration trend +
-- upgrade/downgrade alerts. Reuses erp_customers / erp_profiles. Safe to re-run.
--
--   erp_outlet_grades         : dynamic grade bands (code, min_score, rank)
--   erp_outlet_grade_factors  : dynamic factor weights (sales/visits/msl/…)
--   erp_outlet_grade_history  : per-recompute grade + score + movement
--
-- Drift-safe: ships behind defensive empty states; activates when applied via the
-- staged Drift Closure process.
-- ============================================================================

-- ── Dynamic grade bands ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_outlet_grades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  min_score   NUMERIC NOT NULL DEFAULT 0 CHECK (min_score >= 0 AND min_score <= 100),
  rank        INTEGER NOT NULL DEFAULT 0,         -- higher = better grade
  color       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_erp_outlet_grades_company ON erp_outlet_grades(company_id, is_active);

-- ── Dynamic factor weights (company configurable) ────────────────────────────
CREATE TABLE IF NOT EXISTS erp_outlet_grade_factors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  factor      TEXT NOT NULL,                      -- sales_value | sales_quantity | visit_frequency | msl_compliance | distribution | perfect_store | collection | custom
  weight      NUMERIC NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, factor)
);
CREATE INDEX IF NOT EXISTS idx_erp_outlet_grade_factors_company ON erp_outlet_grade_factors(company_id, is_active);

-- ── Grade history (tracking + migration trend + alerts) ──────────────────────
CREATE TABLE IF NOT EXISTS erp_outlet_grade_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  grade_id    UUID REFERENCES erp_outlet_grades(id) ON DELETE SET NULL,
  score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  movement    TEXT CHECK (movement IS NULL OR movement IN ('upgrade','downgrade','same','new')),
  factors     JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES erp_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_erp_grade_history_customer ON erp_outlet_grade_history(company_id, customer_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_grade_history_company  ON erp_outlet_grade_history(company_id, computed_at DESC);

-- ── RLS: read by company members, write by company admins ────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_outlet_grades','erp_outlet_grade_factors','erp_outlet_grade_history'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ((SELECT erp_is_platform_owner()) OR company_id = (SELECT erp_user_company_id()))', t||'_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_write', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING ((SELECT erp_is_platform_owner()) OR (SELECT erp_is_company_admin(company_id))) WITH CHECK ((SELECT erp_is_platform_owner()) OR (SELECT erp_is_company_admin(company_id)))', t||'_write', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_set_company', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t||'_set_company', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['erp_outlet_grades','erp_outlet_grade_factors'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t||'_updated', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t||'_updated', t);
  END LOOP;
END $$;

-- Rollback (manual): DROP TABLE erp_outlet_grade_history, erp_outlet_grade_factors, erp_outlet_grades;
