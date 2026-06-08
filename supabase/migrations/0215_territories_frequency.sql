-- ============================================================================
-- 0215: Route Optimization — territories + visit frequency rules (Phase 3 FMCG)
-- ----------------------------------------------------------------------------
-- Territory management (city / area / GPS-polygon based) + membership, and the
-- company-configurable visit-frequency rules (NO hardcoded frequencies: A/B/C/D
-- defaults seeded as a platform catalog, company-overridable). Additive + INERT
-- until KAKO_ROUTE_OPTIMIZATION is on. Company-scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_territories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name                text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('city','area','polygon')),
  cities              text[],
  area_ids            uuid[],
  polygon             jsonb,                 -- [{latitude, longitude}, ...] closed ring
  parent_territory_id uuid REFERENCES erp_territories(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_territories_company ON erp_territories (company_id, status);
CREATE INDEX IF NOT EXISTS idx_territories_parent  ON erp_territories (parent_territory_id);

ALTER TABLE erp_territories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_territories_tenant ON erp_territories;
CREATE POLICY erp_territories_tenant ON erp_territories FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

CREATE TABLE IF NOT EXISTS erp_territory_customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  territory_id uuid NOT NULL REFERENCES erp_territories(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (territory_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_territory_customers_company   ON erp_territory_customers (company_id);
CREATE INDEX IF NOT EXISTS idx_territory_customers_territory ON erp_territory_customers (territory_id);
CREATE INDEX IF NOT EXISTS idx_territory_customers_customer  ON erp_territory_customers (customer_id);

ALTER TABLE erp_territory_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_territory_customers_tenant ON erp_territory_customers;
CREATE POLICY erp_territory_customers_tenant ON erp_territory_customers FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Company-configurable visit frequency rules (company_id NULL = platform default).
CREATE TABLE IF NOT EXISTS erp_visit_frequency_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES erp_companies(id) ON DELETE CASCADE,
  classification  text NOT NULL,
  visits_per_week numeric(4,2) NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_freq_company_class
  ON erp_visit_frequency_rules (company_id, classification) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_visit_freq_global_class
  ON erp_visit_frequency_rules (classification) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_visit_freq_company ON erp_visit_frequency_rules (company_id, is_active);

ALTER TABLE erp_visit_frequency_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_visit_freq_tenant ON erp_visit_frequency_rules;
CREATE POLICY erp_visit_freq_tenant ON erp_visit_frequency_rules FOR ALL
  USING (company_id IS NULL OR erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Seed platform default A/B/C/D rules (company_id NULL). Idempotent.
INSERT INTO erp_visit_frequency_rules (company_id, classification, visits_per_week)
SELECT NULL, v.classification, v.vpw
FROM (VALUES ('a', 3), ('b', 2), ('c', 1), ('d', 0.5)) AS v(classification, vpw)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_visit_frequency_rules r WHERE r.company_id IS NULL AND r.classification = v.classification
);
