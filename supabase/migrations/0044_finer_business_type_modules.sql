-- ============================================================================
-- 0044: Finer per-business-type modules (deep menu tailoring)
-- ----------------------------------------------------------------------------
-- Beyond the 4 coarse modules, tag each business type with finer item-level
-- modules: pos (counter sale), sales_orders (distribution), returns, and
-- warehousing (transfers/stock requests/stocktake/warehouses). Pure-service
-- types (clinic/salon/laundry/services) get none, so Sales shows only invoices
-- + customers. Idempotent; backfills existing companies.
-- ============================================================================

INSERT INTO erp_business_type_modules (business_type, module) VALUES
  ('general','sales_orders'),('general','returns'),('general','warehousing'),('general','pos'),
  ('wholesale','sales_orders'),('wholesale','returns'),('wholesale','warehousing'),
  ('delivery','sales_orders'),('delivery','returns'),('delivery','warehousing'),
  ('supermarket','pos'),('supermarket','returns'),('supermarket','warehousing'),
  ('pharmacy','pos'),('pharmacy','returns'),('pharmacy','warehousing'),
  ('clothing','pos'),('clothing','returns'),('clothing','warehousing'),
  ('herbalist','pos'),('herbalist','returns'),('herbalist','warehousing'),
  ('auto_parts','pos'),('auto_parts','returns'),('auto_parts','warehousing'),
  ('bookstore','pos'),('bookstore','returns'),('bookstore','warehousing'),
  ('electronics','pos'),('electronics','returns'),('electronics','warehousing'),
  ('bakery','pos'),('bakery','returns'),('bakery','warehousing'),
  ('butchery','pos'),('butchery','returns'),
  ('restaurant','pos'),
  ('cafe','pos'),
  ('workshop','pos'),('workshop','returns'),('workshop','warehousing')
ON CONFLICT (business_type, module) DO NOTHING;

INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT c.id, btm.module, true
FROM erp_companies c
JOIN erp_business_type_modules btm ON btm.business_type = c.business_type
ON CONFLICT (company_id, module) DO NOTHING;
