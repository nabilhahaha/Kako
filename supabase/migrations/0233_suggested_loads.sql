-- ============================================================================
-- 0233: Suggested Load & Demand Engine (Phase 7E)
-- ----------------------------------------------------------------------------
-- Forecast-based van loading. A per-route/van/day suggested-load sheet (header +
-- lines) with projected demand, current van stock, suggested load, and van
-- utilization. Computed by the pure engine reusing the Phase-6B forecasting engine
-- + van load manifest (0194) + journey plans (0129). Additive + INERT until
-- KAKO_SUGGESTED_LOAD is on. Company-scoped RLS. Depends on 0005, 0018, 0128.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_suggested_loads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id             uuid REFERENCES erp_branches(id) ON DELETE SET NULL,
  warehouse_id          uuid REFERENCES erp_warehouses(id) ON DELETE SET NULL,   -- the van
  salesman_id           uuid,
  route_id              uuid,
  load_date             date NOT NULL DEFAULT CURRENT_DATE,
  status                text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','loaded','cancelled')),
  total_suggested_units numeric(16,3) NOT NULL DEFAULT 0,
  utilization           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suggested_loads_company   ON erp_suggested_loads (company_id, load_date);
CREATE INDEX IF NOT EXISTS idx_suggested_loads_branch    ON erp_suggested_loads (branch_id);
CREATE INDEX IF NOT EXISTS idx_suggested_loads_warehouse ON erp_suggested_loads (warehouse_id);
ALTER TABLE erp_suggested_loads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_suggested_loads_tenant ON erp_suggested_loads;
CREATE POLICY erp_suggested_loads_tenant ON erp_suggested_loads FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

CREATE TABLE IF NOT EXISTS erp_suggested_load_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  suggested_load_id uuid NOT NULL REFERENCES erp_suggested_loads(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  projected_demand  numeric(16,3) NOT NULL DEFAULT 0,
  current_van_stock numeric(16,3) NOT NULL DEFAULT 0,
  suggested_load    numeric(16,3) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suggested_load_lines_company ON erp_suggested_load_lines (company_id);
CREATE INDEX IF NOT EXISTS idx_suggested_load_lines_load    ON erp_suggested_load_lines (suggested_load_id);
CREATE INDEX IF NOT EXISTS idx_suggested_load_lines_product ON erp_suggested_load_lines (product_id);
ALTER TABLE erp_suggested_load_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_suggested_load_lines_tenant ON erp_suggested_load_lines;
CREATE POLICY erp_suggested_load_lines_tenant ON erp_suggested_load_lines FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
