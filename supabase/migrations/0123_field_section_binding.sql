-- ============================================================================
-- 0123: Authorization Phase 5 (P5) — DFG Field-Section Binding
-- ----------------------------------------------------------------------------
-- Wires the FIELD axis of the authorization model (Capability × Scope ×
-- Constraint × Field) to the granular capability catalog (P1) and adds opt-in,
-- section-level access gating. 100% CUTOVER-SAFE / additive.
--
--   1. erp_field_access.subject_type gains 'capability' (alongside 'role',
--      'permission'), so a field's per-subject access can target a granular
--      capability (module.resource.action) — resolved through the P1 alias layer
--      in the app. No existing row changes meaning.
--
--   2. erp_field_section_access — a new overlay (sibling of erp_field_access) that
--      gates a whole SECTION binary (hidden / view) for a role / permission /
--      capability. PRIME DIRECTIVE: with NO rows for a section it is visible to
--      everyone (today's behavior); once a section HAS rows it is restricted to
--      subjects granted 'view'. Admins always see every section (enforced in the
--      app resolver). With the table empty, the DFG engine is byte-identical to
--      today.
--
-- RLS mirrors the DFG tables (0114): read = company members; write = company
-- admin / platform owner. Forward-only, idempotent.
-- ============================================================================

-- ── 1. Allow 'capability' as a field-access subject ───────────────────────────
-- The 0114 CHECK was IN ('role','permission'); widen it. Idempotent: drop the
-- known constraint name if present, re-add the widened one.
DO $$
BEGIN
  ALTER TABLE erp_field_access DROP CONSTRAINT IF EXISTS erp_field_access_subject_type_check;
  ALTER TABLE erp_field_access
    ADD CONSTRAINT erp_field_access_subject_type_check
    CHECK (subject_type IN ('role', 'permission', 'capability'));
END $$;

-- ── 2. erp_field_section_access — per-section access overlay ──────────────────
CREATE TABLE IF NOT EXISTS erp_field_section_access (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity       TEXT NOT NULL,
  section_key  TEXT NOT NULL,                 -- matches erp_field_config.section / erp_field_sections.key
  subject_type TEXT NOT NULL CHECK (subject_type IN ('role', 'permission', 'capability')),
  subject_key  TEXT NOT NULL,
  access       TEXT NOT NULL CHECK (access IN ('hidden', 'view')),  -- sections gate binary
  created_by   UUID,
  updated_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity, section_key, subject_type, subject_key)
);
CREATE INDEX IF NOT EXISTS idx_erp_field_section_access_section
  ON erp_field_section_access(company_id, entity, section_key);

-- RLS + triggers + policies — same posture as erp_field_access (0114).
DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_field_section_access ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_section_access_set_company ON erp_field_section_access';
  EXECUTE 'CREATE TRIGGER erp_field_section_access_set_company BEFORE INSERT ON erp_field_section_access FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_field_section_access_updated ON erp_field_section_access';
  EXECUTE 'CREATE TRIGGER erp_field_section_access_updated BEFORE UPDATE ON erp_field_section_access FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';

  EXECUTE 'DROP POLICY IF EXISTS "erp_field_section_access_read" ON erp_field_section_access';
  EXECUTE 'CREATE POLICY "erp_field_section_access_read" ON erp_field_section_access FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';

  EXECUTE 'DROP POLICY IF EXISTS "erp_field_section_access_write" ON erp_field_section_access';
  EXECUTE 'CREATE POLICY "erp_field_section_access_write" ON erp_field_section_access FOR ALL USING (erp_is_platform_owner() OR erp_is_company_admin(company_id)) WITH CHECK (erp_is_platform_owner() OR erp_is_company_admin(company_id))';
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_field_section_access;
-- ALTER TABLE erp_field_access DROP CONSTRAINT IF EXISTS erp_field_access_subject_type_check;
-- ALTER TABLE erp_field_access ADD CONSTRAINT erp_field_access_subject_type_check
--   CHECK (subject_type IN ('role', 'permission'));
