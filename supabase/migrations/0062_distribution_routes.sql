-- ============================================================================
-- 0062: Distribution — sales routes / territories (خطوط السير)
-- ----------------------------------------------------------------------------
-- A formal route groups customers under a rep + van + visit day. Assigning a
-- customer to a route also stamps its salesman_id and visit_day (so the existing
-- journey plan and rep app keep working). Tenant-scoped. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rep_id UUID,
  van_warehouse_id UUID REFERENCES erp_warehouses(id) ON DELETE SET NULL,
  visit_day TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES erp_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_routes_company ON erp_routes(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_route ON erp_customers(route_id);

ALTER TABLE erp_routes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS erp_routes_set_company ON erp_routes;
CREATE TRIGGER erp_routes_set_company BEFORE INSERT ON erp_routes FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_routes_updated ON erp_routes;
CREATE TRIGGER erp_routes_updated BEFORE UPDATE ON erp_routes FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP POLICY IF EXISTS "erp_routes_tenant" ON erp_routes;
CREATE POLICY "erp_routes_tenant" ON erp_routes FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
