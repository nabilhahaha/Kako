-- ============================================================================
-- 0221: Commercial Excellence — pricing rules + priority + price approval (Phase 7)
-- ----------------------------------------------------------------------------
-- Flexible multi-source pricing: source-typed effective-dated rules, a company-
-- configurable priority hierarchy (no hardcoded order), and a price-change
-- approval workflow (incl. temporary/emergency overrides). Extends the existing
-- pricing engine (0106) additively. INERT until KAKO_COMMERCIAL is on. Company-
-- scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_pricing_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  source         text NOT NULL,     -- standard|customer|contract|branch|region|channel|sub_channel|route|salesman|temporary|promotion|distributor|modern_trade|wholesale|retail
  product_id     uuid REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  scope_ref_id   uuid,              -- the customer/route/channel/... the rule is scoped to
  kind           text NOT NULL CHECK (kind IN ('fixed_price','fixed_discount','percentage_discount','quantity_break','value_break','tiered','time_based','seasonal')),
  price          numeric(14,4),
  discount       numeric(14,4),
  discount_pct   numeric(7,4),
  breaks         jsonb,
  effective_from date,
  effective_to   date,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_company ON erp_pricing_rules (company_id, source, is_active);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_product ON erp_pricing_rules (product_id);
ALTER TABLE erp_pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_pricing_rules_tenant ON erp_pricing_rules;
CREATE POLICY erp_pricing_rules_tenant ON erp_pricing_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Company-configurable price priority (ordered source list).
CREATE TABLE IF NOT EXISTS erp_pricing_priority (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES erp_companies(id) ON DELETE CASCADE,
  priority   text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE erp_pricing_priority ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_pricing_priority_tenant ON erp_pricing_priority;
CREATE POLICY erp_pricing_priority_tenant ON erp_pricing_priority FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Price change requests (approval workflow + temporary/emergency override).
CREATE TABLE IF NOT EXISTS erp_price_change_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  request_kind   text NOT NULL DEFAULT 'change' CHECK (request_kind IN ('change','temporary_override','emergency_override')),
  requested_price numeric(14,4),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected')),
  requested_by   uuid,
  decided_by     uuid,
  effective_from date,
  effective_to   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_price_change_req_company ON erp_price_change_requests (company_id, status);
CREATE INDEX IF NOT EXISTS idx_price_change_req_product ON erp_price_change_requests (product_id);
ALTER TABLE erp_price_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_price_change_req_tenant ON erp_price_change_requests;
CREATE POLICY erp_price_change_req_tenant ON erp_price_change_requests FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
