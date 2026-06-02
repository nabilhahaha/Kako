-- ============================================================================
-- 0063: Fix module taxonomy — isolate distribution; drop generic sales from
--       pure-service verticals
-- ----------------------------------------------------------------------------
-- A clinic/salon/laundry was wrongly showing the generic "المبيعات" section and
-- the field/distribution tools (rep settlement, journey, routes, targets,
-- distribution report) because (a) those business types carried the broad
-- 'sales' module and (b) the distribution UI was gated by 'sales'.
--
-- Fix:
--  * New 'distribution' module, granted only to field-distribution business
--    types (general / wholesale / delivery). The distribution UI is re-gated to
--    it in code.
--  * Remove 'sales' from clinic / salon / laundry — they sell through their own
--    vertical (+ accounting), not the generic sales/invoice/rep stack.
-- Backfills existing tenants. Safe to re-run.
-- ============================================================================

-- 1) distribution module for field-distribution business types
INSERT INTO erp_business_type_modules (business_type, module) VALUES
  ('general','distribution'),('wholesale','distribution'),('delivery','distribution')
ON CONFLICT (business_type, module) DO NOTHING;

INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'distribution' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;

INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'distribution', true FROM erp_companies WHERE business_type IN ('general','wholesale','delivery')
ON CONFLICT (company_id, module) DO NOTHING;

-- 2) pure-service verticals shouldn't carry the generic 'sales' module
DELETE FROM erp_business_type_modules
 WHERE module = 'sales' AND business_type IN ('clinic','salon','laundry');

DELETE FROM erp_company_modules cm
USING erp_companies c
WHERE cm.company_id = c.id
  AND cm.module = 'sales'
  AND c.business_type IN ('clinic','salon','laundry');
