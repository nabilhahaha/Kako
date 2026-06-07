-- ============================================================================
-- 0194: Distribution Foundation — van load manifest
-- ----------------------------------------------------------------------------
-- The formal record of WHAT was loaded onto a van for a day's selling — the
-- missing link between an (approved) stock request, the day's sales, and the
-- end-of-day van reconciliation (surveyed gap). Additive + INERT: nothing writes
-- it until KAKO_DISTRIBUTION is on; the existing stock-request → reconciliation
-- flow is unchanged. Branch-scoped RLS mirroring erp_stock_requests.
--   * erp_van_load_manifests       — header (van warehouse, rep, date, status)
--   * erp_van_load_manifest_lines  — loaded qty per product
-- Depends on 0005/0011 (erp_branches/_warehouses/_products_catalog/_stock_requests,
-- erp_user_branch_ids()).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_van_load_manifests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         uuid NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  warehouse_id      uuid NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,  -- the van
  salesman_id       uuid,                                                            -- auth.users (no FK, mirrors erp_visits)
  stock_request_id  uuid REFERENCES erp_stock_requests(id) ON DELETE SET NULL,       -- the approved load source
  manifest_number   text,
  manifest_date     date NOT NULL DEFAULT CURRENT_DATE,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','loaded','reconciled','cancelled')),
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_van_manifests_branch    ON erp_van_load_manifests (branch_id, manifest_date);
CREATE INDEX IF NOT EXISTS idx_van_manifests_warehouse ON erp_van_load_manifests (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_van_manifests_request   ON erp_van_load_manifests (stock_request_id);

CREATE TABLE IF NOT EXISTS erp_van_load_manifest_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id  uuid NOT NULL REFERENCES erp_van_load_manifests(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  loaded_qty   numeric(14,3) NOT NULL CHECK (loaded_qty >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manifest_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_van_manifest_lines_manifest ON erp_van_load_manifest_lines (manifest_id);
CREATE INDEX IF NOT EXISTS idx_van_manifest_lines_product  ON erp_van_load_manifest_lines (product_id);

-- ── RLS: branch-scoped, mirroring erp_stock_requests ────────────────────────
ALTER TABLE erp_van_load_manifests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_van_load_manifest_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_van_manifests_select ON erp_van_load_manifests;
CREATE POLICY erp_van_manifests_select ON erp_van_load_manifests FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));
DROP POLICY IF EXISTS erp_van_manifests_manage ON erp_van_load_manifests;
CREATE POLICY erp_van_manifests_manage ON erp_van_load_manifests FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()))
  WITH CHECK (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS erp_van_manifest_lines_select ON erp_van_load_manifest_lines;
CREATE POLICY erp_van_manifest_lines_select ON erp_van_load_manifest_lines FOR SELECT
  USING (manifest_id IN (SELECT id FROM erp_van_load_manifests WHERE branch_id = ANY(erp_user_branch_ids())));
DROP POLICY IF EXISTS erp_van_manifest_lines_manage ON erp_van_load_manifest_lines;
CREATE POLICY erp_van_manifest_lines_manage ON erp_van_load_manifest_lines FOR ALL
  USING (manifest_id IN (SELECT id FROM erp_van_load_manifests WHERE branch_id = ANY(erp_user_branch_ids())))
  WITH CHECK (manifest_id IN (SELECT id FROM erp_van_load_manifests WHERE branch_id = ANY(erp_user_branch_ids())));
