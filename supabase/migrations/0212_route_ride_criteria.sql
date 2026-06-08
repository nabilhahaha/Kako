-- ============================================================================
-- 0212: Route Riding Excellence — evaluation criteria catalog (Phase 3 FMCG)
-- ----------------------------------------------------------------------------
-- Company-configurable evaluation criteria — the "no hardcoded scores / no
-- hardcoded FMCG rules" layer: every criterion (category, weight, max_score) is
-- DATA, overridable per company. company_id NULL = platform default catalog
-- (readable by all tenants); company rows override/extend. Additive + INERT until
-- KAKO_ROUTE_RIDING is on. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_route_ride_criteria (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES erp_companies(id) ON DELETE CASCADE,  -- NULL = platform catalog
  category    text NOT NULL,
  code        text NOT NULL,
  label       text NOT NULL,
  weight      numeric(6,2) NOT NULL DEFAULT 1,
  max_score   numeric(6,2) NOT NULL DEFAULT 5,
  is_active   boolean NOT NULL DEFAULT true,
  sort        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- FK-covering (first index col = company_id) via the company unique index + a global one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_ride_criteria_company_code
  ON erp_route_ride_criteria (company_id, code) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_ride_criteria_global_code
  ON erp_route_ride_criteria (code) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_route_ride_criteria_company
  ON erp_route_ride_criteria (company_id, category, is_active);

ALTER TABLE erp_route_ride_criteria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_route_ride_criteria_tenant ON erp_route_ride_criteria;
CREATE POLICY erp_route_ride_criteria_tenant ON erp_route_ride_criteria FOR ALL
  USING (company_id IS NULL OR erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Seed the platform default criteria (company_id NULL). Idempotent.
INSERT INTO erp_route_ride_criteria (company_id, category, code, label, weight, max_score, sort)
SELECT NULL, v.category, v.code, v.label, 1, 5, v.sort
FROM (VALUES
  ('sales_fundamentals','opening','Opening',10),
  ('sales_fundamentals','greeting','Greeting',20),
  ('sales_fundamentals','relationship_building','Relationship Building',30),
  ('sales_fundamentals','customer_knowledge','Customer Knowledge',40),
  ('sales_execution','product_presentation','Product Presentation',50),
  ('sales_execution','promotion_communication','Promotion Communication',60),
  ('sales_execution','new_sku_introduction','New SKU Introduction',70),
  ('sales_execution','objection_handling','Objection Handling',80),
  ('sales_execution','negotiation','Negotiation',90),
  ('order_taking','stock_review','Stock Review',100),
  ('order_taking','gap_identification','Gap Identification',110),
  ('order_taking','order_suggestion','Order Suggestion',120),
  ('order_taking','order_closing','Order Closing',130),
  ('collections','outstanding_review','Outstanding Review',140),
  ('collections','collection_attempt','Collection Attempt',150),
  ('collections','collection_effectiveness','Collection Effectiveness',160),
  ('merchandising','msl_compliance','MSL Compliance',170),
  ('merchandising','osa','OSA',180),
  ('merchandising','oos_detection','OOS Detection',190),
  ('merchandising','display_compliance','Display Compliance',200),
  ('merchandising','shelf_share','Shelf Share',210),
  ('merchandising','competitor_presence','Competitor Presence',220),
  ('near_expiry','near_expiry_detection','Near Expiry Detection',230),
  ('near_expiry','return_identification','Return Identification',240),
  ('near_expiry','recovery_opportunity','Recovery Opportunity',250)
) AS v(category, code, label, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_route_ride_criteria c WHERE c.company_id IS NULL AND c.code = v.code
);
