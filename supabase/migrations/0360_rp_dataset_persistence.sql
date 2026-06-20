-- 0360: Wave B — persisted customer working set (the linchpin).
--
-- Moves the uploaded/connected customer dataset off the browser (React state + IndexedDB
-- draft) onto governed, company-scoped, RLS-protected server storage. ONE persisted model
-- that Manual Upload, Google Sheets, and Generic API all write into — the connector
-- pipeline stays shared (Fetch → Map → Validate → Data Health → Sync History → Persist
-- Dataset). IndexedDB remains the unsaved-draft / recovery tier only. NO ERP data.
--
-- Design source: "VANTORA Planner — Planning Persistence Technical Design", item #1.

-- ── Dataset header (one per saved/synced working set) ───────────────────────
CREATE TABLE IF NOT EXISTS erp_rp_datasets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL REFERENCES erp_profiles(id)  ON DELETE CASCADE,
  name        text NOT NULL,
  -- How the rows arrived. Manual Upload + every connector share the SAME model.
  source      text NOT NULL DEFAULT 'manual_upload',
  source_id   uuid REFERENCES erp_rp_data_sources(id) ON DELETE SET NULL,  -- connector link
  sync_run_id uuid REFERENCES erp_rp_sync_runs(id)    ON DELETE SET NULL,  -- the Sync History row
  row_count   int NOT NULL DEFAULT 0,    -- rows stored
  valid_count int NOT NULL DEFAULT 0,    -- rows that passed validation (name + geo)
  columns     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- the column mapping / headers used
  bbox        jsonb,                                -- { minLat, minLng, maxLat, maxLng }
  is_active   boolean NOT NULL DEFAULT false,       -- the owner's active planning dataset
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_ds_name_chk   CHECK (length(btrim(name)) > 0),
  CONSTRAINT rp_ds_source_chk CHECK (source IN ('manual_upload','google_sheets','api_erp','connector','manual'))
);
CREATE INDEX IF NOT EXISTS idx_rp_ds_company  ON erp_rp_datasets (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_ds_owner    ON erp_rp_datasets (owner_id);
CREATE INDEX IF NOT EXISTS idx_rp_ds_source   ON erp_rp_datasets (source_id);    -- FK covering index
CREATE INDEX IF NOT EXISTS idx_rp_ds_syncrun  ON erp_rp_datasets (sync_run_id);  -- FK covering index
-- At most one active dataset per owner (per company).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rp_ds_active ON erp_rp_datasets (company_id, owner_id) WHERE is_active;

-- ── Dataset rows (one per customer; the planning working set) ────────────────
CREATE TABLE IF NOT EXISTS erp_rp_dataset_customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id  uuid NOT NULL REFERENCES erp_rp_datasets(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES erp_companies(id)   ON DELETE CASCADE,  -- denormalised for RLS + filtering
  seq         int  NOT NULL DEFAULT 0,                                          -- stable order for paging
  code        text,
  name        text NOT NULL,
  lat         double precision,
  lng         double precision,
  salesman    text,
  route       text,
  channel     text,
  class       text,
  city        text,
  area        text,
  region      text,
  -- The long tail (phone, address, supervisor, sales, grade, frequency, notes, …) so the
  -- canonical model is preserved without a column per attribute.
  attrs       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rp_dsc_dataset ON erp_rp_dataset_customers (dataset_id, seq);  -- paged ordered reads
CREATE INDEX IF NOT EXISTS idx_rp_dsc_company ON erp_rp_dataset_customers (company_id);
CREATE INDEX IF NOT EXISTS idx_rp_dsc_code    ON erp_rp_dataset_customers (dataset_id, code);

-- ── RLS — datasets are visible to the owner + their reporting subtree (managers
--    see their team's datasets via rp_can_see_user, the SAME authority as Requests),
--    plus company-admin oversight. Writes = owner or admin. ───────────────────
ALTER TABLE erp_rp_datasets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rp_ds_sel ON erp_rp_datasets;
CREATE POLICY rp_ds_sel ON erp_rp_datasets FOR SELECT
  USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR owner_id = (select auth.uid())
          OR rp_can_see_user(owner_id, company_id)))
  );
DROP POLICY IF EXISTS rp_ds_ins ON erp_rp_datasets;
CREATE POLICY rp_ds_ins ON erp_rp_datasets FOR INSERT
  WITH CHECK (company_id = erp_user_company_id() AND owner_id = (select auth.uid()));
DROP POLICY IF EXISTS rp_ds_upd ON erp_rp_datasets;
CREATE POLICY rp_ds_upd ON erp_rp_datasets FOR UPDATE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
         AND (erp_is_company_admin(company_id) OR owner_id = (select auth.uid()))))
  WITH CHECK (company_id = erp_user_company_id());
DROP POLICY IF EXISTS rp_ds_del ON erp_rp_datasets;
CREATE POLICY rp_ds_del ON erp_rp_datasets FOR DELETE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
         AND (erp_is_company_admin(company_id) OR owner_id = (select auth.uid()))));

-- Rows inherit their dataset's visibility (EXISTS against the PK-indexed parent).
ALTER TABLE erp_rp_dataset_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rp_dsc_sel ON erp_rp_dataset_customers;
CREATE POLICY rp_dsc_sel ON erp_rp_dataset_customers FOR SELECT
  USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND EXISTS (
          SELECT 1 FROM erp_rp_datasets d
          WHERE d.id = dataset_id
            AND (erp_is_company_admin(d.company_id) OR d.owner_id = (select auth.uid()) OR rp_can_see_user(d.owner_id, d.company_id))))
  );
DROP POLICY IF EXISTS rp_dsc_wr ON erp_rp_dataset_customers;
CREATE POLICY rp_dsc_wr ON erp_rp_dataset_customers FOR ALL
  USING (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id() AND EXISTS (
          SELECT 1 FROM erp_rp_datasets d
          WHERE d.id = dataset_id AND (erp_is_company_admin(d.company_id) OR d.owner_id = (select auth.uid()))))
  )
  WITH CHECK (
    erp_is_platform_owner()
    OR (company_id = erp_user_company_id() AND EXISTS (
          SELECT 1 FROM erp_rp_datasets d
          WHERE d.id = dataset_id AND (erp_is_company_admin(d.company_id) OR d.owner_id = (select auth.uid()))))
  );

-- ── Validation queries (run after apply) ────────────────────────────────────
-- SELECT count(*) FROM erp_rp_datasets;  SELECT count(*) FROM erp_rp_dataset_customers;
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_datasets'::regclass;          -- 4
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_dataset_customers'::regclass;  -- 2
-- SELECT indexname FROM pg_indexes WHERE tablename='erp_rp_datasets' AND indexname='uq_rp_ds_active';
--
-- ── Rollback (manual) ───────────────────────────────────────────────────────
--   DROP TABLE erp_rp_dataset_customers;  DROP TABLE erp_rp_datasets;
