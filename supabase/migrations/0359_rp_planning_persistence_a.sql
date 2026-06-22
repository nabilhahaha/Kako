-- 0359: Wave A — Planning persistence foundation (Saved Segments + Mapping/Route Templates).
--
-- First slice of moving Planner artifacts off the browser (localStorage) onto governed,
-- company-scoped, RLS-protected server storage. Two low-risk, filter/metadata-only
-- artifacts — no customer rows are stored here (that is Wave B). All RP-owned and
-- independent of the VANTORA ERP. NOT APPLIED to staging yet — for review.
--
-- Design source: "VANTORA Planner — Planning Persistence Technical Design", items #2 + #6.

-- ── 1. Saved Segments (named, reusable customer FILTER — never customer rows) ──
-- Owner-private: a manager's saved views follow them across devices. The filter applies
-- to whatever dataset is loaded, so there are no dangling customer references.
CREATE TABLE IF NOT EXISTS erp_rp_segments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL REFERENCES erp_profiles(id)  ON DELETE CASCADE,
  name        text NOT NULL,
  -- { search?, city?, area?, salesman?, channel?, class? } — predicate-only.
  filter      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_seg_name_chk CHECK (length(btrim(name)) > 0)
);
CREATE INDEX IF NOT EXISTS idx_rp_seg_company ON erp_rp_segments (company_id);
CREATE INDEX IF NOT EXISTS idx_rp_seg_owner   ON erp_rp_segments (owner_id);
-- "Save (or replace by exact name)" semantics, per owner (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rp_seg_owner_name ON erp_rp_segments (company_id, owner_id, lower(name));

ALTER TABLE erp_rp_segments ENABLE ROW LEVEL SECURITY;
-- Owner-private reads (+ platform/super/company-admin oversight). auth.uid() wrapped
-- as (select auth.uid()) per the RLS init-plan invariant.
DROP POLICY IF EXISTS rp_seg_sel ON erp_rp_segments;
CREATE POLICY rp_seg_sel ON erp_rp_segments FOR SELECT
  USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id()
        AND (erp_is_company_admin(company_id) OR owner_id = (select auth.uid())))
  );
DROP POLICY IF EXISTS rp_seg_ins ON erp_rp_segments;
CREATE POLICY rp_seg_ins ON erp_rp_segments FOR INSERT
  WITH CHECK (company_id = erp_user_company_id() AND owner_id = (select auth.uid()));
DROP POLICY IF EXISTS rp_seg_upd ON erp_rp_segments;
CREATE POLICY rp_seg_upd ON erp_rp_segments FOR UPDATE
  USING (company_id = erp_user_company_id() AND owner_id = (select auth.uid()))
  WITH CHECK (company_id = erp_user_company_id() AND owner_id = (select auth.uid()));
DROP POLICY IF EXISTS rp_seg_del ON erp_rp_segments;
CREATE POLICY rp_seg_del ON erp_rp_segments FOR DELETE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
         AND (erp_is_company_admin(company_id) OR owner_id = (select auth.uid()))));

-- ── 2. Mapping / Route Templates — REUSE erp_rp_field_mappings (no new table) ──
-- A Day-Planner "format" (named column mapping, matched by a header fingerprint) is the
-- same shape as a connector field mapping. We extend the existing table with a `kind`
-- discriminator instead of creating a parallel store:
--   kind='connector' (default) — the existing per-source/-entity binding (source_id set).
--   kind='template'            — a company-shared, reusable upload format (no source).
ALTER TABLE erp_rp_field_mappings
  ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'connector',
  ADD COLUMN IF NOT EXISTS name        text,        -- template display name
  ADD COLUMN IF NOT EXISTS headers     jsonb,       -- original file headers (match scoring)
  ADD COLUMN IF NOT EXISTS fingerprint text,        -- normalised, order-insensitive signature
  ADD COLUMN IF NOT EXISTS owner_id    uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

-- Templates have no data source; connector mappings always do. Existing rows are
-- kind='connector' with source_id set, so they satisfy the invariant unchanged.
ALTER TABLE erp_rp_field_mappings ALTER COLUMN source_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE erp_rp_field_mappings ADD CONSTRAINT rp_map_kind_chk CHECK (kind IN ('connector','template'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE erp_rp_field_mappings ADD CONSTRAINT rp_map_shape_chk CHECK (
    (kind = 'connector' AND source_id IS NOT NULL)
    OR (kind = 'template' AND name IS NOT NULL AND length(btrim(name)) > 0)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_rp_map_owner ON erp_rp_field_mappings (owner_id);   -- FK covering index
-- Company-shared template names are unique (case-insensitive); connector rows excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rp_tmpl_name ON erp_rp_field_mappings (company_id, lower(name)) WHERE kind = 'template';

-- Broaden the existing *_wr policy so a template's OWNER (any planner) can manage their
-- own templates, while connector mappings remain admin-only (0355 + 0358). Reads stay
-- company-wide via the existing *_sel policy (templates are a shared company asset).
DROP POLICY IF EXISTS erp_rp_field_mappings_wr ON erp_rp_field_mappings;
CREATE POLICY erp_rp_field_mappings_wr ON erp_rp_field_mappings FOR ALL
  USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rp_access_role(company_id) = 'route_planner_admin'
          OR (kind = 'template' AND owner_id = (select auth.uid()))))
  )
  WITH CHECK (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR rp_access_role(company_id) = 'route_planner_admin'
          OR (kind = 'template' AND owner_id = (select auth.uid()))))
  );

-- ── Validation queries (run after apply) ────────────────────────────────────
-- SELECT count(*) FROM erp_rp_segments;                                   -- table exists
-- SELECT kind, count(*) FROM erp_rp_field_mappings GROUP BY kind;          -- existing rows all 'connector'
-- SELECT conname FROM pg_constraint WHERE conrelid='erp_rp_field_mappings'::regclass AND conname LIKE 'rp_map_%';
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_segments'::regclass; -- 4 policies
--
-- ── Rollback (manual) ───────────────────────────────────────────────────────
--   DROP TABLE erp_rp_segments;
--   DROP INDEX uq_rp_tmpl_name; DROP INDEX idx_rp_map_owner;
--   ALTER TABLE erp_rp_field_mappings DROP CONSTRAINT rp_map_shape_chk, DROP CONSTRAINT rp_map_kind_chk;
--   DELETE FROM erp_rp_field_mappings WHERE kind='template';   -- remove template rows BEFORE re-adding NOT NULL
--   ALTER TABLE erp_rp_field_mappings ALTER COLUMN source_id SET NOT NULL;
--   ALTER TABLE erp_rp_field_mappings DROP COLUMN created_at, DROP COLUMN owner_id, DROP COLUMN fingerprint,
--     DROP COLUMN headers, DROP COLUMN name, DROP COLUMN kind;
--   -- then recreate erp_rp_field_mappings_wr from 0358.
