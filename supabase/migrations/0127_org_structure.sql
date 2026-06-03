-- ============================================================================
-- 0127: Company Onboarding — Organization Structure (optional roles + reporting
--       hierarchy that drives scope)
-- ----------------------------------------------------------------------------
-- Roles are OPTIONAL per company; a company may run Manager+Salesman, or
-- Manager+Supervisor+Salesman, etc. The reporting hierarchy is a role-level
-- template (who reports to whom) with OPTIONAL per-branch overrides, so different
-- branches can have different depth (Cairo: Manager→Supervisor→Salesman; Giza:
-- Manager→Salesman directly). The hierarchy drives SCOPE through the existing P3
-- machinery (erp_user_branches.reports_to → erp_user_subtree → own_team), so no
-- scope rules change here — this just declares the default chain and makes it
-- editable. Additive + idempotent.
--
--   1. erp_org_role_hierarchy — per-company (and optionally per-branch) role
--      reporting chain. branch_id NULL = the company default.
--   2. erp_apply_company_template gains a "hierarchy" payload key (applied here).
--   3. erp_default_reports_to(company_id, role_key, branch_id) — resolves the
--      reports-to role for a user being assigned (branch override else default).
-- ============================================================================

-- ── 1. erp_org_role_hierarchy ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_org_role_hierarchy (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  role_key             TEXT NOT NULL,
  reports_to_role_key  TEXT,                 -- NULL = top of the chain
  branch_id            UUID REFERENCES erp_branches(id) ON DELETE CASCADE, -- NULL = company default
  sort                 INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT erp_org_role_hierarchy_no_self CHECK (reports_to_role_key IS NULL OR reports_to_role_key <> role_key),
  UNIQUE NULLS NOT DISTINCT (company_id, role_key, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_org_role_hierarchy_company ON erp_org_role_hierarchy(company_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_org_role_hierarchy ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_org_role_hierarchy_set_company ON erp_org_role_hierarchy';
  EXECUTE 'CREATE TRIGGER erp_org_role_hierarchy_set_company BEFORE INSERT ON erp_org_role_hierarchy FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_org_role_hierarchy_updated ON erp_org_role_hierarchy';
  EXECUTE 'CREATE TRIGGER erp_org_role_hierarchy_updated BEFORE UPDATE ON erp_org_role_hierarchy FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_org_role_hierarchy_read" ON erp_org_role_hierarchy';
  EXECUTE 'CREATE POLICY "erp_org_role_hierarchy_read" ON erp_org_role_hierarchy FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_org_role_hierarchy_write" ON erp_org_role_hierarchy';
  EXECUTE 'CREATE POLICY "erp_org_role_hierarchy_write" ON erp_org_role_hierarchy FOR ALL USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))) WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))';
END $$;

-- ── 1b. Company Admins may add/remove their own company's roles ───────────────
-- erp_company_roles writes were platform-owner-only (0021); widen to own-company
-- admins so roles can be edited later (req: admin can add/remove roles). Platform
-- owner retains full access; an admin is confined to their own tenant.
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS erp_company_roles_ins ON erp_company_roles';
  EXECUTE $p$CREATE POLICY erp_company_roles_ins ON erp_company_roles FOR INSERT
    WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))$p$;
  EXECUTE 'DROP POLICY IF EXISTS erp_company_roles_upd ON erp_company_roles';
  EXECUTE $p$CREATE POLICY erp_company_roles_upd ON erp_company_roles FOR UPDATE
    USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
    WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))$p$;
  EXECUTE 'DROP POLICY IF EXISTS erp_company_roles_del ON erp_company_roles';
  EXECUTE $p$CREATE POLICY erp_company_roles_del ON erp_company_roles FOR DELETE
    USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))$p$;
END $$;

-- ── 2. Resolve the reports-to role for a user being assigned ───────────────────
-- Prefers a branch-specific override, else the company default. Read helper used
-- when adding users so reports_to follows the declared org structure.
CREATE OR REPLACE FUNCTION erp_default_reports_to(p_company_id uuid, p_role_key text, p_branch_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT reports_to_role_key FROM erp_org_role_hierarchy
   WHERE company_id = p_company_id AND role_key = p_role_key
     AND (branch_id = p_branch_id OR branch_id IS NULL)
   ORDER BY (branch_id IS NOT NULL) DESC   -- branch override wins over company default
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.erp_default_reports_to(uuid, text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_default_reports_to(uuid, text, uuid) TO authenticated, service_role;

-- ── 3. Re-emit erp_apply_company_template with hierarchy application ───────────
-- Identical to 0126 plus a "hierarchy" key: [{ "role_key":"salesman",
-- "reports_to_role_key":"supervisor" }, ...] → company-default rows (branch_id
-- NULL). All else unchanged. Still PLATFORM-OWNER-ONLY, idempotent.
CREATE OR REPLACE FUNCTION erp_apply_company_template(p_company_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  n_modules int := 0; n_roles int := 0; n_caps int := 0; n_limits int := 0; n_sections int := 0; n_hier int := 0;
  rk text; cap text; lim jsonb; sec jsonb; hy jsonb;
BEGIN
  IF NOT erp_is_platform_owner() THEN
    RAISE EXCEPTION 'only the platform owner may apply a company template' USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'company % not found', p_company_id;
  END IF;

  INSERT INTO erp_company_modules (company_id, module, enabled)
  SELECT p_company_id, m, true
  FROM jsonb_array_elements_text(coalesce(p_payload->'modules','[]'::jsonb)) AS m
  ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;
  GET DIAGNOSTICS n_modules = ROW_COUNT;

  -- roles: enable the SELECTED set; DISABLE any catalog role not chosen so the
  -- company runs only the roles the operator picked (optional roles per company).
  INSERT INTO erp_company_roles (company_id, role_key, enabled)
  SELECT p_company_id, r, true
  FROM jsonb_array_elements_text(coalesce(p_payload->'roles','[]'::jsonb)) AS r
  ON CONFLICT (company_id, role_key) DO UPDATE SET enabled = true;
  GET DIAGNOSTICS n_roles = ROW_COUNT;
  IF jsonb_array_length(coalesce(p_payload->'roles','[]'::jsonb)) > 0 THEN
    UPDATE erp_company_roles SET enabled = false
     WHERE company_id = p_company_id
       AND role_key NOT IN (SELECT jsonb_array_elements_text(p_payload->'roles'))
       AND role_key <> 'admin';   -- never disable the owner role
  END IF;

  FOR rk IN SELECT jsonb_object_keys(coalesce(p_payload->'capabilities','{}'::jsonb)) LOOP
    FOR cap IN SELECT jsonb_array_elements_text(p_payload->'capabilities'->rk) LOOP
      INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
      VALUES (p_company_id, rk, cap)
      ON CONFLICT (company_id, role_key, permission) DO NOTHING;
      n_caps := n_caps + 1;
    END LOOP;
  END LOOP;

  FOR lim IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'limits','[]'::jsonb)) LOOP
    INSERT INTO erp_role_limits (company_id, role_key, action, max_amount, max_percent)
    VALUES (p_company_id, lim->>'role_key', lim->>'action',
            NULLIF(lim->>'max_amount','')::numeric, NULLIF(lim->>'max_percent','')::numeric)
    ON CONFLICT (company_id, user_id, role_key, action) DO NOTHING;
    n_limits := n_limits + 1;
  END LOOP;

  FOR sec IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'section_access','[]'::jsonb)) LOOP
    INSERT INTO erp_field_section_access (company_id, entity, section_key, subject_type, subject_key, access)
    VALUES (p_company_id, sec->>'entity', sec->>'section_key', sec->>'subject_type', sec->>'subject_key', sec->>'access')
    ON CONFLICT (company_id, entity, section_key, subject_type, subject_key) DO NOTHING;
    n_sections := n_sections + 1;
  END LOOP;

  -- hierarchy (company-default rows; branch overrides set later in the console)
  FOR hy IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'hierarchy','[]'::jsonb)) LOOP
    INSERT INTO erp_org_role_hierarchy (company_id, role_key, reports_to_role_key, branch_id)
    VALUES (p_company_id, hy->>'role_key', NULLIF(hy->>'reports_to_role_key',''), NULL)
    ON CONFLICT (company_id, role_key, branch_id) DO UPDATE SET reports_to_role_key = EXCLUDED.reports_to_role_key;
    n_hier := n_hier + 1;
  END LOOP;

  PERFORM erp_log_audit('apply_template', 'company', p_company_id::text,
    jsonb_build_object('modules', n_modules, 'roles', n_roles, 'capabilities', n_caps,
                       'limits', n_limits, 'section_access', n_sections, 'hierarchy', n_hier), p_company_id);

  RETURN jsonb_build_object('modules', n_modules, 'roles', n_roles, 'capabilities', n_caps,
                            'limits', n_limits, 'section_access', n_sections, 'hierarchy', n_hier);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_apply_company_template(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_apply_company_template(uuid, jsonb) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- Restore the 0126 body of erp_apply_company_template (no hierarchy / no role
-- disabling), then:
--   DROP FUNCTION IF EXISTS erp_default_reports_to(uuid, text, uuid);
--   DROP TABLE IF EXISTS erp_org_role_hierarchy;
