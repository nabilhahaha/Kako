-- ============================================================================
-- 0126: Company Onboarding Wizard — schema + Trade Marketing Manager role +
--       onboarding checklist + atomic template-application RPC
-- ----------------------------------------------------------------------------
-- Supports the Platform-Owner Company Onboarding Wizard. ADDITIVE + idempotent.
--   1. erp_companies: + country / locale / timezone / status (Trial|Active|
--      Suspended). All nullable/defaulted — no existing row changes meaning;
--      is_active stays the operational flag (the wizard keeps status↔is_active in
--      sync: suspended ⇒ is_active=false).
--   2. New role 'trade_marketing_manager' (+ default flat permissions) and its
--      enablement for the wholesale (FMCG distribution) business type.
--   3. erp_onboarding_checklist — per-company guided setup tasks.
--   4. erp_apply_company_template(company_id, payload) — a SECURITY DEFINER,
--      PLATFORM-OWNER-ONLY RPC that atomically applies a resolved industry-pack
--      template (modules, roles, capability grants, approval limits, section
--      access) to a freshly-created company. Reuses the same tables the Authz
--      Console writes; never weakens RLS.
-- ============================================================================

-- ── 1. Company onboarding columns ─────────────────────────────────────────────
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS country  TEXT;
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS locale   TEXT;   -- default language (e.g. 'ar','en')
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS timezone TEXT;   -- IANA tz (e.g. 'Asia/Riyadh')
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS status   TEXT
  CHECK (status IS NULL OR status IN ('trial', 'active', 'suspended'));

-- ── 2. Trade Marketing Manager role (FMCG) ────────────────────────────────────
INSERT INTO erp_roles (key, name_ar, is_system, rank)
VALUES ('trade_marketing_manager', 'مدير التسويق التجاري', true, 5)
ON CONFLICT (key) DO NOTHING;

-- Default flat permissions: pricing, customer data, reporting/analytics visibility
-- (trade marketing owns pricing & promotions; no selling / inventory ops).
INSERT INTO erp_role_permissions (role_key, permission)
SELECT 'trade_marketing_manager', p
FROM (VALUES ('reports.view'), ('accounting.view'), ('pricing.manage'),
             ('customers.manage'), ('wholesale.pricing')) AS v(p)
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = 'trade_marketing_manager')
ON CONFLICT (role_key, permission) DO NOTHING;

-- Enable it for the wholesale (FMCG distribution) business type.
INSERT INTO erp_business_type_roles (business_type, role_key, enabled)
VALUES ('wholesale', 'trade_marketing_manager', true)
ON CONFLICT (business_type, role_key) DO NOTHING;

-- ── 3. Onboarding checklist ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_onboarding_checklist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  item_key    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  label_ar    TEXT NOT NULL,
  href        TEXT,
  done        BOOLEAN NOT NULL DEFAULT false,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_erp_onboarding_checklist_company ON erp_onboarding_checklist(company_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_onboarding_checklist ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_onboarding_checklist_set_company ON erp_onboarding_checklist';
  EXECUTE 'CREATE TRIGGER erp_onboarding_checklist_set_company BEFORE INSERT ON erp_onboarding_checklist FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_onboarding_checklist_updated ON erp_onboarding_checklist';
  EXECUTE 'CREATE TRIGGER erp_onboarding_checklist_updated BEFORE UPDATE ON erp_onboarding_checklist FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  -- Read: any company member. Write: company admin or platform owner.
  EXECUTE 'DROP POLICY IF EXISTS "erp_onboarding_checklist_read" ON erp_onboarding_checklist';
  EXECUTE 'CREATE POLICY "erp_onboarding_checklist_read" ON erp_onboarding_checklist FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_onboarding_checklist_write" ON erp_onboarding_checklist';
  EXECUTE 'CREATE POLICY "erp_onboarding_checklist_write" ON erp_onboarding_checklist FOR ALL USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))) WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))';
END $$;

-- ── 4. Atomic template-application RPC (platform owner only) ───────────────────
-- Applies a resolved industry-pack template to a company in ONE transaction.
-- payload shape:
--   { "modules":        ["sales","inventory",...],
--     "roles":          ["admin","sales_director",...],
--     "capabilities":   { "admin":[...], "accountant":[...] },
--     "limits":         [ {"role_key":"branch_manager","action":"purchasing.po.approve","max_amount":100000,"max_percent":null}, ... ],
--     "section_access": [ {"entity":"customer","section_key":"financial","subject_type":"role","subject_key":"accountant","access":"view"}, ... ] }
-- All keys optional. Idempotent (ON CONFLICT DO NOTHING / upsert). Returns counts.
CREATE OR REPLACE FUNCTION erp_apply_company_template(p_company_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  n_modules int := 0; n_roles int := 0; n_caps int := 0; n_limits int := 0; n_sections int := 0;
  rk text; cap text; lim jsonb; sec jsonb;
BEGIN
  IF NOT erp_is_platform_owner() THEN
    RAISE EXCEPTION 'only the platform owner may apply a company template' USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'company % not found', p_company_id;
  END IF;

  -- modules → enable
  INSERT INTO erp_company_modules (company_id, module, enabled)
  SELECT p_company_id, m, true
  FROM jsonb_array_elements_text(coalesce(p_payload->'modules','[]'::jsonb)) AS m
  ON CONFLICT (company_id, module) DO UPDATE SET enabled = true;
  GET DIAGNOSTICS n_modules = ROW_COUNT;

  -- roles → enable
  INSERT INTO erp_company_roles (company_id, role_key, enabled)
  SELECT p_company_id, r, true
  FROM jsonb_array_elements_text(coalesce(p_payload->'roles','[]'::jsonb)) AS r
  ON CONFLICT (company_id, role_key) DO UPDATE SET enabled = true;
  GET DIAGNOSTICS n_roles = ROW_COUNT;

  -- capabilities → grant (role_key → [capability])
  FOR rk IN SELECT jsonb_object_keys(coalesce(p_payload->'capabilities','{}'::jsonb)) LOOP
    FOR cap IN SELECT jsonb_array_elements_text(p_payload->'capabilities'->rk) LOOP
      INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
      VALUES (p_company_id, rk, cap)
      ON CONFLICT (company_id, role_key, permission) DO NOTHING;
      n_caps := n_caps + 1;
    END LOOP;
  END LOOP;

  -- limits (role-level)
  FOR lim IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'limits','[]'::jsonb)) LOOP
    INSERT INTO erp_role_limits (company_id, role_key, action, max_amount, max_percent)
    VALUES (
      p_company_id,
      lim->>'role_key',
      lim->>'action',
      NULLIF(lim->>'max_amount','')::numeric,
      NULLIF(lim->>'max_percent','')::numeric
    )
    ON CONFLICT (company_id, user_id, role_key, action) DO NOTHING;
    n_limits := n_limits + 1;
  END LOOP;

  -- section access
  FOR sec IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'section_access','[]'::jsonb)) LOOP
    INSERT INTO erp_field_section_access (company_id, entity, section_key, subject_type, subject_key, access)
    VALUES (
      p_company_id,
      sec->>'entity',
      sec->>'section_key',
      sec->>'subject_type',
      sec->>'subject_key',
      sec->>'access'
    )
    ON CONFLICT (company_id, entity, section_key, subject_type, subject_key) DO NOTHING;
    n_sections := n_sections + 1;
  END LOOP;

  PERFORM erp_log_audit('apply_template', 'company', p_company_id::text,
    jsonb_build_object('modules', n_modules, 'roles', n_roles, 'capabilities', n_caps,
                       'limits', n_limits, 'section_access', n_sections), p_company_id);

  RETURN jsonb_build_object('modules', n_modules, 'roles', n_roles, 'capabilities', n_caps,
                            'limits', n_limits, 'section_access', n_sections);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_apply_company_template(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_apply_company_template(uuid, jsonb) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_apply_company_template(uuid, jsonb);
-- DROP TABLE IF EXISTS erp_onboarding_checklist;
-- DELETE FROM erp_business_type_roles WHERE role_key='trade_marketing_manager';
-- DELETE FROM erp_role_permissions WHERE role_key='trade_marketing_manager';
-- DELETE FROM erp_roles WHERE key='trade_marketing_manager';
-- ALTER TABLE erp_companies DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS timezone,
--   DROP COLUMN IF EXISTS locale, DROP COLUMN IF EXISTS country;
