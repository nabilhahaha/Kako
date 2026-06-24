-- ============================================================================
-- 0379: Multi-Form Field Work — form assignment model (ADDITIVE).
--
-- Adds erp_form_assignments: which users/roles/teams/branches a form is offered to,
-- and (optionally) which customers it applies to. This is the only NEW table for the
-- multi-form system's assignment layer; it sits on top of the existing 0240 forms
-- backbone (erp_forms / erp_form_versions / erp_form_responses) — none of which are
-- modified. The existing Field Verification form (code 'fv_verification') is untouched.
--
--   target_type:
--     user-scope (WHO can see/fill the form):
--       'user'       → target_value = erp_profiles.id (auth user id)
--       'role'       → target_value = a role key ('admin','manager','supervisor',
--                       'salesman','viewer', or 'all')
--       'team'       → target_value = erp_teams.id
--       'department' → target_value = erp_departments.id
--       'branch'     → target_value = erp_branches.id
--       'supervisor' → target_value = a supervisor's user id (their reporting subtree)
--     customer-scope (WHICH customers a customer-linked form applies to; does NOT by
--       itself grant a user visibility):
--       'dataset'    → target_value = erp_rp_datasets.id
--       'city'       → target_value = a city string
--       'channel'    → target_value = a channel string
--
-- Company-scoped RLS: company members read; company admin / forms.admin write.
-- No data rewrite, no destructive change. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_form_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  form_id      uuid NOT NULL REFERENCES erp_forms(id)     ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN
                 ('user','role','team','department','branch','supervisor','dataset','city','channel')),
  target_value text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (form_id, target_type, target_value)
);

-- Covering indexes (schema-health invariant: every FK's first index column = the FK).
CREATE INDEX IF NOT EXISTS idx_form_assignments_company    ON erp_form_assignments (company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_form_assignments_form       ON erp_form_assignments (form_id);
CREATE INDEX IF NOT EXISTS idx_form_assignments_created_by ON erp_form_assignments (created_by);
-- Fast "does this target match me" lookup for the My-Forms resolver.
CREATE INDEX IF NOT EXISTS idx_form_assignments_lookup
  ON erp_form_assignments (company_id, target_type, target_value) WHERE is_active;

ALTER TABLE erp_form_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_form_assignments_read ON erp_form_assignments;
CREATE POLICY erp_form_assignments_read ON erp_form_assignments FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP POLICY IF EXISTS erp_form_assignments_write ON erp_form_assignments;
CREATE POLICY erp_form_assignments_write ON erp_form_assignments FOR ALL
  USING (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id()
        AND (erp_is_company_admin(company_id) OR erp_user_has_permission(company_id, 'forms.admin')))
  )
  WITH CHECK (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id()
        AND (erp_is_company_admin(company_id) OR erp_user_has_permission(company_id, 'forms.admin')))
  );

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_form_assignments;
