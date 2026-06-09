-- ============================================================================
-- 0246: Van Sales (Phase B) — van load confirmation handshake + request fields
-- ----------------------------------------------------------------------------
-- The core FMCG loading gate: a warehouse-prepared load manifest (0194 — what was
-- loaded) becomes salesman-confirmed (accept / reject / accept-with-variance), and
-- ONLY the accepted quantity enters van stock (posted to the ledger on confirm in
-- a later increment). Variance per line (short/extra/damaged/wrong/expiry) is
-- captured here for tracking + reporting. Company-scoped RLS (mirrors the van-
-- accounting tables 0138/0229/0233). Additive + INERT until KAKO_VAN_SALES.
--
-- Also extends the existing stock-request entity ADDITIVELY (nullable / defaulted)
-- so the salesman request + supervisor adjustment fit without touching existing
-- behavior: `origin` (salesman | supervisor_direct) and per-line `approved_qty`
-- (the supervisor-adjusted quantity; NULL until adjusted). Depends on 0011/0194.
-- ============================================================================

-- ── Load confirmation header (one per manifest) ──────────────────────────────
CREATE TABLE IF NOT EXISTS erp_van_load_confirmations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  manifest_id  uuid NOT NULL REFERENCES erp_van_load_manifests(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES erp_warehouses(id) ON DELETE SET NULL,   -- the van
  salesman_id  uuid,
  -- Outcome: accept_full | accept_partial | reject_full | accept_with_variance.
  status        text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accept_full','accept_partial','reject_full','accept_with_variance')),
  -- Variance review (warehouse → supervisor if the company configures it).
  requires_review boolean NOT NULL DEFAULT false,
  review_status   text NOT NULL DEFAULT 'none'
                 CHECK (review_status IN ('none','pending','warehouse_reviewed','approved','rejected')),
  notes        text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manifest_id)
);
CREATE INDEX IF NOT EXISTS idx_van_load_conf_company   ON erp_van_load_confirmations (company_id, status);
CREATE INDEX IF NOT EXISTS idx_van_load_conf_manifest  ON erp_van_load_confirmations (manifest_id);
CREATE INDEX IF NOT EXISTS idx_van_load_conf_warehouse ON erp_van_load_confirmations (warehouse_id);
ALTER TABLE erp_van_load_confirmations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_van_load_conf_set_company ON erp_van_load_confirmations;
CREATE TRIGGER erp_van_load_conf_set_company BEFORE INSERT ON erp_van_load_confirmations
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_van_load_conf_updated ON erp_van_load_confirmations;
CREATE TRIGGER erp_van_load_conf_updated BEFORE UPDATE ON erp_van_load_confirmations
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS erp_van_load_conf_read ON erp_van_load_confirmations;
CREATE POLICY erp_van_load_conf_read ON erp_van_load_confirmations FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_van_load_conf_write ON erp_van_load_confirmations;
CREATE POLICY erp_van_load_conf_write ON erp_van_load_confirmations FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Load confirmation lines (loaded vs accepted → variance) ──────────────────
CREATE TABLE IF NOT EXISTS erp_van_load_confirmation_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  confirmation_id uuid NOT NULL REFERENCES erp_van_load_confirmations(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  loaded_qty      numeric(14,3) NOT NULL DEFAULT 0,
  accepted_qty    numeric(14,3) NOT NULL DEFAULT 0,
  variance_qty    numeric(14,3) NOT NULL DEFAULT 0,   -- accepted - loaded (negative = short)
  variance_reason text CHECK (variance_reason IS NULL OR variance_reason IN
                    ('short','extra','damaged','wrong_item','expiry','other')),
  notes           text,
  photo_ref       text,                                -- reference to an attached photo
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (confirmation_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_van_load_conf_lines_company ON erp_van_load_confirmation_lines (company_id);
CREATE INDEX IF NOT EXISTS idx_van_load_conf_lines_conf    ON erp_van_load_confirmation_lines (confirmation_id);
CREATE INDEX IF NOT EXISTS idx_van_load_conf_lines_product ON erp_van_load_confirmation_lines (product_id);
ALTER TABLE erp_van_load_confirmation_lines ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_van_load_conf_lines_set_company ON erp_van_load_confirmation_lines;
CREATE TRIGGER erp_van_load_conf_lines_set_company BEFORE INSERT ON erp_van_load_confirmation_lines
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP POLICY IF EXISTS erp_van_load_conf_lines_read ON erp_van_load_confirmation_lines;
CREATE POLICY erp_van_load_conf_lines_read ON erp_van_load_confirmation_lines FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_van_load_conf_lines_write ON erp_van_load_confirmation_lines;
CREATE POLICY erp_van_load_conf_lines_write ON erp_van_load_confirmation_lines FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Additive stock-request fields (salesman request + supervisor adjustment) ──
ALTER TABLE erp_stock_requests      ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'salesman';
ALTER TABLE erp_stock_request_lines ADD COLUMN IF NOT EXISTS approved_qty numeric(14,3);

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS erp_van_load_confirmation_lines;
-- DROP TABLE IF EXISTS erp_van_load_confirmations;
-- ALTER TABLE erp_stock_requests      DROP COLUMN IF EXISTS origin;
-- ALTER TABLE erp_stock_request_lines DROP COLUMN IF EXISTS approved_qty;
