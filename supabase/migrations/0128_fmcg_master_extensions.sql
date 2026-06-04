-- ============================================================================
-- 0128: FMCG Operations Foundation — master-data field extensions
-- ----------------------------------------------------------------------------
-- ADDITIVE only. Extends existing masters (no new masters, no duplication) with
-- the fields the FMCG operations layer needs. Every column is ADD COLUMN IF NOT
-- EXISTS, nullable / safe-defaulted, so no existing row changes meaning.
--
--   customers : allowed_gps_radius (geofence override), created_source,
--               updated_source, customer_type_id (lookup)
--   products  : brand, subcategory, pack_size, expiry_days, created_source
--   routes    : code, region_id, city, working_days, status, sort
--   warehouses: warehouse_type (main|branch|van) — derived-defaulted from is_van
--   visits    : GPS check-in/out (lat/lng/time), gps_distance_m, gps_status,
--               out_of_route, work_session_id, route_id, sequence
-- ============================================================================

-- ── Customers ─────────────────────────────────────────────────────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS allowed_gps_radius INTEGER;          -- metres; null = use company default
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'manual'; -- manual|import|erp|api
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS updated_source TEXT;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS customer_type_id UUID REFERENCES erp_customer_lookups(id) ON DELETE SET NULL;

-- ── Products ──────────────────────────────────────────────────────────────────
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS pack_size TEXT;
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS expiry_days INTEGER;            -- shelf life in days
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS created_source TEXT DEFAULT 'manual';

-- ── Routes ────────────────────────────────────────────────────────────────────
ALTER TABLE erp_routes ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE erp_routes ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES erp_regions(id) ON DELETE SET NULL;
ALTER TABLE erp_routes ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE erp_routes ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL;
ALTER TABLE erp_routes ADD COLUMN IF NOT EXISTS working_days TEXT[];                       -- e.g. {sat,sun,mon}
ALTER TABLE erp_routes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'));
ALTER TABLE erp_routes ADD COLUMN IF NOT EXISTS sort INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_routes_company_code ON erp_routes(company_id, code) WHERE code IS NOT NULL;

-- ── Warehouses ────────────────────────────────────────────────────────────────
ALTER TABLE erp_warehouses ADD COLUMN IF NOT EXISTS warehouse_type TEXT
  CHECK (warehouse_type IS NULL OR warehouse_type IN ('main','branch','van'));
-- backfill from the existing is_van flag (safe, idempotent)
UPDATE erp_warehouses SET warehouse_type = CASE WHEN is_van THEN 'van' ELSE 'branch' END
  WHERE warehouse_type IS NULL;

-- ── Visits (GPS + day/session linkage) ───────────────────────────────────────
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS work_session_id UUID REFERENCES erp_work_sessions(id) ON DELETE SET NULL;
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES erp_routes(id) ON DELETE SET NULL;
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS sequence INTEGER;
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS check_in_at TIMESTAMPTZ;
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS check_in_lat NUMERIC(9,6);
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS check_in_lng NUMERIC(9,6);
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS check_out_at TIMESTAMPTZ;
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS check_out_lat NUMERIC(9,6);
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS check_out_lng NUMERIC(9,6);
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS gps_distance_m INTEGER;                    -- metres from customer pin
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS gps_status TEXT
  CHECK (gps_status IS NULL OR gps_status IN ('ok','violation','no_customer_gps','no_device_gps'));
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS out_of_route BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE erp_visits ADD COLUMN IF NOT EXISTS in_journey_plan BOOLEAN;                    -- was the customer on today's plan?

CREATE INDEX IF NOT EXISTS idx_erp_visits_session ON erp_visits(work_session_id);
CREATE INDEX IF NOT EXISTS idx_erp_visits_salesman_date ON erp_visits(salesman_id, visit_date);

-- ── Company-level FMCG ops settings (GPS radius default, sort mode, day-close) ─
-- One row per company; created lazily. Holds tunables the later phases read.
CREATE TABLE IF NOT EXISTS erp_fmcg_settings (
  company_id              UUID PRIMARY KEY REFERENCES erp_companies(id) ON DELETE CASCADE,
  default_gps_radius_m    INTEGER NOT NULL DEFAULT 150,
  journey_sort_mode       TEXT NOT NULL DEFAULT 'nearest' CHECK (journey_sort_mode IN ('manual','nearest','optimized','hybrid')),
  gps_notify              TEXT NOT NULL DEFAULT 'supervisor' CHECK (gps_notify IN ('none','supervisor','manager','both')),
  gps_require_approval    BOOLEAN NOT NULL DEFAULT false,
  out_of_route_notify     TEXT NOT NULL DEFAULT 'supervisor' CHECK (out_of_route_notify IN ('none','supervisor','manager','both')),
  out_of_route_require_approval BOOLEAN NOT NULL DEFAULT false,
  day_close_min_coverage  INTEGER NOT NULL DEFAULT 80,            -- percent
  day_close_require_reason BOOLEAN NOT NULL DEFAULT true,
  day_close_require_approval_below INTEGER,                        -- coverage % below which approval is required (null = never)
  van_transfer_auto_approve_below NUMERIC(14,2),                   -- value threshold; null = always require approval
  van_transfer_approver   TEXT NOT NULL DEFAULT 'supervisor' CHECK (van_transfer_approver IN ('supervisor','manager')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_fmcg_settings ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_fmcg_settings_updated ON erp_fmcg_settings';
  EXECUTE 'CREATE TRIGGER erp_fmcg_settings_updated BEFORE UPDATE ON erp_fmcg_settings FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_fmcg_settings_read" ON erp_fmcg_settings';
  EXECUTE 'CREATE POLICY "erp_fmcg_settings_read" ON erp_fmcg_settings FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS "erp_fmcg_settings_write" ON erp_fmcg_settings';
  EXECUTE 'CREATE POLICY "erp_fmcg_settings_write" ON erp_fmcg_settings FOR ALL USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))) WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))';
END $$;

-- Resolve the effective geofence radius for a customer (override else company default else 150).
CREATE OR REPLACE FUNCTION erp_customer_gps_radius(p_customer_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT c.allowed_gps_radius FROM erp_customers c WHERE c.id = p_customer_id),
    (SELECT s.default_gps_radius_m FROM erp_fmcg_settings s
       JOIN erp_customers c ON c.id = p_customer_id AND c.company_id = s.company_id),
    150
  );
$$;
REVOKE EXECUTE ON FUNCTION public.erp_customer_gps_radius(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_customer_gps_radius(uuid) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_customer_gps_radius(uuid);
-- DROP TABLE IF EXISTS erp_fmcg_settings;
-- ALTER TABLE erp_visits DROP COLUMN IF EXISTS in_journey_plan, ... (all added cols);
-- ALTER TABLE erp_warehouses DROP COLUMN IF EXISTS warehouse_type;
-- ALTER TABLE erp_routes DROP COLUMN IF EXISTS code, ... ;
-- ALTER TABLE erp_products_catalog DROP COLUMN IF EXISTS brand, ... ;
-- ALTER TABLE erp_customers DROP COLUMN IF EXISTS allowed_gps_radius, ... ;
