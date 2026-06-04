-- ============================================================================
-- 0134: FMCG operations — seed granular flat PERMISSIONS as role defaults
-- ----------------------------------------------------------------------------
-- Seeds the net-new FMCG-operations flat permission keys (permissions.ts) as
-- DEFAULT RECOMMENDATIONS into the role→permission matrix. These are stored
-- exactly like every other flat permission — a (role_key, permission) row — so
-- can()/expandAliases() resolve them with no other change.
--
-- admin / manager already hold '*', so they are intentionally NOT listed here.
-- The grant matrix mirrors ROLE_PERMISSIONS defaults in src/lib/erp/permissions.ts.
--
-- Applies to (a) the GLOBAL default template erp_role_permissions (so new /
-- inheriting tenants get it, including via erp_seed_company_roles on creation),
-- and (b) a BACKFILL into erp_company_role_permissions for every existing
-- company-scoped tenant where the mapped role is enabled. Idempotent.
--
-- The grant matrix is inlined as a VALUES CTE in each statement below.
-- (Deliberately NOT a TEMP TABLE: under psql's per-statement autocommit a
-- CREATE TEMP TABLE ... ON COMMIT DROP is dropped before the next statement
-- runs. A VALUES CTE is correct under both per-statement and single-transaction
-- execution.) Mirrors the approach in 0124_p6_grant_finer_capabilities.sql.
-- ============================================================================

-- (a) GLOBAL defaults — new tenants + tenants that inherit globals. Only seed
-- for roles that exist in the catalog (defensive).
INSERT INTO erp_role_permissions (role_key, permission)
SELECT g.role_key, g.permission
FROM (VALUES
  -- salesman
  ('salesman', 'day.close'),
  ('salesman', 'stock.view'),
  ('salesman', 'stock.transfer'),
  ('salesman', 'customer.create'),
  -- supervisor
  ('supervisor', 'visit.approve_out_of_route'),
  ('supervisor', 'day.approve_close_exception'),
  ('supervisor', 'stock.transfer.approve'),
  ('supervisor', 'customer.transfer'),
  ('supervisor', 'journey.create'),
  ('supervisor', 'route.create'),
  ('supervisor', 'stock.view'),
  -- branch_manager
  ('branch_manager', 'customer.transfer'),
  ('branch_manager', 'customer.create'),
  ('branch_manager', 'customer.edit'),
  ('branch_manager', 'route.create'),
  ('branch_manager', 'journey.create'),
  ('branch_manager', 'stock.adjust'),
  ('branch_manager', 'stock.transfer.approve'),
  ('branch_manager', 'visit.approve_out_of_route'),
  ('branch_manager', 'day.approve_close_exception'),
  ('branch_manager', 'stock.view'),
  ('branch_manager', 'user.transfer'),
  -- regional_manager
  ('regional_manager', 'customer.transfer'),
  ('regional_manager', 'journey.create'),
  ('regional_manager', 'route.create'),
  ('regional_manager', 'stock.view'),
  -- area_manager
  ('area_manager', 'customer.transfer'),
  ('area_manager', 'journey.create'),
  ('area_manager', 'route.create'),
  ('area_manager', 'stock.view'),
  -- sales_director
  ('sales_director', 'customer.transfer'),
  ('sales_director', 'route.create'),
  ('sales_director', 'journey.create'),
  ('sales_director', 'stock.view'),
  -- national_sales_manager
  ('national_sales_manager', 'customer.transfer'),
  ('national_sales_manager', 'route.create'),
  ('national_sales_manager', 'journey.create'),
  ('national_sales_manager', 'stock.view'),
  -- warehouse_keeper
  ('warehouse_keeper', 'stock.view'),
  ('warehouse_keeper', 'stock.adjust'),
  ('warehouse_keeper', 'stock.transfer'),
  ('warehouse_keeper', 'stock.transfer.approve'),
  -- accountant
  ('accountant', 'stock.view'),
  -- it_admin
  ('it_admin', 'customer.import'),
  ('it_admin', 'product.import'),
  ('it_admin', 'user.import'),
  ('it_admin', 'route.import'),
  ('it_admin', 'journey.import')
) AS g(role_key, permission)
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = g.role_key)
ON CONFLICT (role_key, permission) DO NOTHING;

-- (b) BACKFILL existing company-scoped tenants: grant each mapped permission to
-- every company where that role is ENABLED (so a company that customizes its
-- roles — and therefore resolves from erp_company_role_permissions — also gets
-- the new defaults). Companies without company-scoped config inherit (a).
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, v.role_key, v.permission
FROM (VALUES
  ('salesman', 'day.close'),
  ('salesman', 'stock.view'),
  ('salesman', 'stock.transfer'),
  ('salesman', 'customer.create'),
  ('supervisor', 'visit.approve_out_of_route'),
  ('supervisor', 'day.approve_close_exception'),
  ('supervisor', 'stock.transfer.approve'),
  ('supervisor', 'customer.transfer'),
  ('supervisor', 'journey.create'),
  ('supervisor', 'route.create'),
  ('supervisor', 'stock.view'),
  ('branch_manager', 'customer.transfer'),
  ('branch_manager', 'customer.create'),
  ('branch_manager', 'customer.edit'),
  ('branch_manager', 'route.create'),
  ('branch_manager', 'journey.create'),
  ('branch_manager', 'stock.adjust'),
  ('branch_manager', 'stock.transfer.approve'),
  ('branch_manager', 'visit.approve_out_of_route'),
  ('branch_manager', 'day.approve_close_exception'),
  ('branch_manager', 'stock.view'),
  ('branch_manager', 'user.transfer'),
  ('regional_manager', 'customer.transfer'),
  ('regional_manager', 'journey.create'),
  ('regional_manager', 'route.create'),
  ('regional_manager', 'stock.view'),
  ('area_manager', 'customer.transfer'),
  ('area_manager', 'journey.create'),
  ('area_manager', 'route.create'),
  ('area_manager', 'stock.view'),
  ('sales_director', 'customer.transfer'),
  ('sales_director', 'route.create'),
  ('sales_director', 'journey.create'),
  ('sales_director', 'stock.view'),
  ('national_sales_manager', 'customer.transfer'),
  ('national_sales_manager', 'route.create'),
  ('national_sales_manager', 'journey.create'),
  ('national_sales_manager', 'stock.view'),
  ('warehouse_keeper', 'stock.view'),
  ('warehouse_keeper', 'stock.adjust'),
  ('warehouse_keeper', 'stock.transfer'),
  ('warehouse_keeper', 'stock.transfer.approve'),
  ('accountant', 'stock.view'),
  ('it_admin', 'customer.import'),
  ('it_admin', 'product.import'),
  ('it_admin', 'user.import'),
  ('it_admin', 'route.import'),
  ('it_admin', 'journey.import')
) AS v(role_key, permission)
JOIN erp_company_roles cr ON cr.role_key = v.role_key AND cr.enabled
ON CONFLICT (company_id, role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_role_permissions WHERE permission IN (
--   'customer.create','customer.import','customer.transfer','customer.edit',
--   'product.create','product.import','stock.view','stock.adjust','stock.transfer',
--   'stock.transfer.approve','user.import','user.transfer','route.create','route.import',
--   'journey.create','journey.import','visit.override_gps','visit.approve_out_of_route',
--   'day.close','day.approve_close_exception');
-- DELETE FROM erp_company_role_permissions WHERE permission IN ( ...same list... );
