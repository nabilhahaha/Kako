-- ============================================================================
-- 0180: Workflow Builder Phase 1 — publishing, versioning, templates
-- ----------------------------------------------------------------------------
-- Additive schema for the lightweight Builder over the SINGLE engine. No new
-- engine/runtime. Adds: definition lifecycle (draft/published/archived), template
-- visibility (global/company/private), immutable version snapshots, and instance
-- version pinning. Depends on 0088 + 0176/0177/0178.
-- ============================================================================

-- 1. Definition lifecycle + template tier + version pointer.
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'draft';
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS published_at   timestamptz;
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS published_by   uuid;
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS visibility     text NOT NULL DEFAULT 'company';
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS owner_id       uuid;
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS latest_version int NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_wf_def_status_chk') THEN
    ALTER TABLE erp_workflow_definitions ADD CONSTRAINT erp_wf_def_status_chk
      CHECK (status IN ('draft','published','archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_wf_def_visibility_chk') THEN
    ALTER TABLE erp_workflow_definitions ADD CONSTRAINT erp_wf_def_visibility_chk
      CHECK (visibility IN ('global','company','private'));
  END IF;
END $$;

-- Backfill existing rows so legacy behaviour is preserved:
UPDATE erp_workflow_definitions SET visibility = 'global' WHERE company_id IS NULL AND visibility = 'company';
UPDATE erp_workflow_definitions SET status = 'published', latest_version = GREATEST(version,1), published_at = COALESCE(published_at, now())
  WHERE is_active = true AND status = 'draft';
UPDATE erp_workflow_definitions SET status = 'archived' WHERE is_active = false AND status = 'draft';

-- 2. Immutable version snapshots.
CREATE TABLE IF NOT EXISTS erp_workflow_definition_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid REFERENCES erp_companies(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES erp_workflow_definitions(id) ON DELETE CASCADE,
  version       int  NOT NULL,
  snapshot      jsonb NOT NULL,        -- { definition, steps[] } at publish time
  published_by  uuid,
  published_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (definition_id, version)       -- (definition_id, …) also covers that FK
);
CREATE INDEX IF NOT EXISTS idx_erp_wf_defver_company ON erp_workflow_definition_versions (company_id);
ALTER TABLE erp_workflow_definition_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_wf_defver_tenant ON erp_workflow_definition_versions;
CREATE POLICY erp_wf_defver_tenant ON erp_workflow_definition_versions FOR ALL
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- 3. Instance version pinning (runtime executes the pinned snapshot).
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS workflow_version int;

-- 4. Extend definition RLS for the template tiers (global/company/private).
DROP POLICY IF EXISTS erp_wf_def_read ON erp_workflow_definitions;
CREATE POLICY erp_wf_def_read ON erp_workflow_definitions FOR SELECT USING (
  erp_is_platform_owner()
  OR visibility = 'global'
  OR (company_id = erp_user_company_id() AND (visibility <> 'private' OR owner_id = (select auth.uid())))
);
DROP POLICY IF EXISTS erp_wf_def_write ON erp_workflow_definitions;
CREATE POLICY erp_wf_def_write ON erp_workflow_definitions FOR ALL USING (
  erp_is_platform_owner()
  OR (visibility = 'private' AND owner_id = (select auth.uid()) AND company_id = erp_user_company_id())
  OR (visibility = 'company' AND company_id IS NOT NULL AND erp_is_company_admin(company_id))
) WITH CHECK (
  erp_is_platform_owner()
  OR (visibility = 'private' AND owner_id = (select auth.uid()) AND company_id = erp_user_company_id())
  OR (visibility = 'company' AND company_id IS NOT NULL AND erp_is_company_admin(company_id))
);

-- Down (manual): drop the added columns/constraints, erp_workflow_definition_versions,
--                instances.workflow_version; restore the 0088 def policies.
