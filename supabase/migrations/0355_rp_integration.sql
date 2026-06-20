-- 0355: Integration Foundation + Sync History + Data Health (Route Planner backend).
--
-- One pluggable-source pipeline. Manual Upload is connector #1; Google Sheets / API /
-- scheduled add only a fetch step later — the model below is unchanged. All RP-owned,
-- company-scoped, RLS-protected, independent of the VANTORA ERP. NOT APPLIED yet.

-- ── Data sources (one per configured connection) ────────────────────────────
CREATE TABLE IF NOT EXISTS erp_rp_data_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'manual_upload',
  status      text NOT NULL DEFAULT 'active',
  -- Source-specific settings so NEW source types need NO schema change:
  -- google_sheets: { sheet_id, range, auth_ref }; api_erp: { endpoint, auth_ref };
  -- scheduled: { cron | daily_time }.
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule    text,                       -- daily time / cron; null = manual only
  last_sync_at  timestamptz,
  last_status   text,
  created_by  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_src_type_chk   CHECK (type IN ('manual_upload','google_sheets','api_erp','scheduled')),
  CONSTRAINT rp_src_status_chk CHECK (status IN ('active','paused','error'))
);
CREATE INDEX IF NOT EXISTS idx_rp_src_company ON erp_rp_data_sources (company_id);

-- ── Per-entity field mappings (one row per source + dataset) ─────────────────
CREATE TABLE IF NOT EXISTS erp_rp_field_mappings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES erp_rp_data_sources(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity      text NOT NULL,
  mapping     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { system_field: source_column }
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_map_entity_chk CHECK (entity IN
    ('customer_master','sales','visits','credit','routes','returns','targets','hierarchy')),
  CONSTRAINT uq_rp_map UNIQUE (source_id, entity)
);
CREATE INDEX IF NOT EXISTS idx_rp_map_company ON erp_rp_field_mappings (company_id);

-- ── Sync runs (= Sync History + Data Health results) ────────────────────────
CREATE TABLE IF NOT EXISTS erp_rp_sync_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid REFERENCES erp_rp_data_sources(id) ON DELETE SET NULL,
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  trigger       text NOT NULL DEFAULT 'manual',
  source_label  text,                      -- filename / sheet / endpoint
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running',
  rows_imported int NOT NULL DEFAULT 0,
  rows_updated  int NOT NULL DEFAULT 0,
  rows_rejected int NOT NULL DEFAULT 0,
  errors        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- rejected-row details
  quality       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- data-health check counts
  CONSTRAINT rp_run_trigger_chk CHECK (trigger IN ('manual','scheduled')),
  CONSTRAINT rp_run_status_chk  CHECK (status IN ('running','success','failed','partial'))
);
CREATE INDEX IF NOT EXISTS idx_rp_run_company ON erp_rp_sync_runs (company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_run_source  ON erp_rp_sync_runs (source_id);

-- ── RLS: company-scoped reads; company-admin (or platform owner / super admin) writes ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['erp_rp_data_sources','erp_rp_field_mappings','erp_rp_sync_runs']) AS tbl
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_sel', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR SELECT
      USING (erp_is_platform_owner() OR erp_is_super_admin() OR company_id = erp_user_company_id())$p$, r.tbl||'_sel', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_wr', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL
      USING (erp_is_platform_owner() OR erp_is_super_admin() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
      WITH CHECK (erp_is_platform_owner() OR erp_is_super_admin() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))$p$, r.tbl||'_wr', r.tbl);
  END LOOP;
END $$;

-- Rollback (manual): DROP TABLE erp_rp_sync_runs, erp_rp_field_mappings, erp_rp_data_sources;
