-- ============================================================================
-- 0240: Form Builder (8F-1) — form definitions + versions + responses
-- ----------------------------------------------------------------------------
-- Business-process foundation (8F). No-code forms composed of typed fields
-- (reusing the custom-field types + the survey scoring model), versioned
-- (draft→publish like the workflow engine), attachable to an entity or a workflow
-- step. Responses are immutable. Additive + INERT until KAKO_FORM_BUILDER.
-- Company-scoped RLS (+ global form templates, company_id IS NULL, read-only).
-- Depends on 0005/0018 (companies), 0087 (custom fields), 0144 (surveys).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_forms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- NULL = global template
  code        text NOT NULL,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  entity      text,                                                  -- optional bound entity
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_forms_company ON erp_forms (company_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_forms_global_code ON erp_forms (code) WHERE company_id IS NULL;
ALTER TABLE erp_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_forms_read ON erp_forms;
CREATE POLICY erp_forms_read ON erp_forms FOR SELECT
  USING (company_id IS NULL OR erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_forms_write ON erp_forms;
CREATE POLICY erp_forms_write ON erp_forms FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Versioned schema (draft → publish). The schema jsonb is {sections,fields[]}.
CREATE TABLE IF NOT EXISTS erp_form_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES erp_companies(id) ON DELETE CASCADE,
  form_id      uuid NOT NULL REFERENCES erp_forms(id) ON DELETE CASCADE,
  version      integer NOT NULL DEFAULT 1,
  schema       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, version)
);
CREATE INDEX IF NOT EXISTS idx_form_versions_form ON erp_form_versions (form_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_form_versions_company ON erp_form_versions (company_id);
ALTER TABLE erp_form_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_form_versions_read ON erp_form_versions;
CREATE POLICY erp_form_versions_read ON erp_form_versions FOR SELECT
  USING (company_id IS NULL OR erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_form_versions_write ON erp_form_versions;
CREATE POLICY erp_form_versions_write ON erp_form_versions FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Immutable responses (SELECT + INSERT only — no UPDATE/DELETE policy).
CREATE TABLE IF NOT EXISTS erp_form_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  form_id     uuid NOT NULL REFERENCES erp_forms(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  entity      text,
  record_id   text,
  answers     jsonb NOT NULL DEFAULT '{}'::jsonb,
  score       numeric,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_responses_company ON erp_form_responses (company_id, form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_form ON erp_form_responses (form_id, created_at DESC);
ALTER TABLE erp_form_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_form_responses_read ON erp_form_responses;
CREATE POLICY erp_form_responses_read ON erp_form_responses FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_form_responses_insert ON erp_form_responses;
CREATE POLICY erp_form_responses_insert ON erp_form_responses FOR INSERT
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_form_responses;
-- DROP TABLE IF EXISTS erp_form_versions;
-- DROP TABLE IF EXISTS erp_forms;
