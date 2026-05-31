-- ============================================================================
-- 0064: Restaurant / café — drop the redundant generic sales + pos modules
-- ----------------------------------------------------------------------------
-- Food-service tenants sell through the dedicated 'restaurant' module (dine-in /
-- takeaway / delivery orders + checkout). The generic 'sales' (invoices /
-- customers / sales report) and 'pos' quick-sale were redundant and exposed a
-- second, parallel selling UI. Aligning with clinic/salon/laundry: a vertical
-- business uses its own module (+ inventory for stock + accounting), not the
-- generic sales stack. Backfills existing tenants. Safe to re-run.
-- ============================================================================

DELETE FROM erp_business_type_modules
 WHERE module IN ('sales', 'pos') AND business_type IN ('restaurant', 'cafe');

DELETE FROM erp_company_modules cm
USING erp_companies c
WHERE cm.company_id = c.id
  AND cm.module IN ('sales', 'pos')
  AND c.business_type IN ('restaurant', 'cafe');
