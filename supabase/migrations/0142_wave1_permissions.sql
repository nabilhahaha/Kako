-- ============================================================================
-- 0142: Value Acceleration Wave 1 — seed granular flat PERMISSIONS as defaults
-- ----------------------------------------------------------------------------
-- Seeds the net-new Wave-1 flat permission keys as DEFAULT RECOMMENDATIONS into
-- the role→permission matrix, exactly mirroring 0134's approach: an inline VALUES
-- CTE (NOT a temp table) applied to (a) the GLOBAL default template
-- erp_role_permissions and (b) a BACKFILL into erp_company_role_permissions for
-- every existing company-scoped tenant where the mapped role is ENABLED.
-- ON CONFLICT DO NOTHING, only for roles that exist. Idempotent.
--
-- admin / manager already hold '*', so they are intentionally NOT listed here.
-- 'pricing.manage' already exists (0106/0107) — omitted to avoid churn; it is
-- re-granted here only where a Wave-1 role newly needs it.
--
-- NOTE: the TS Permission union + PERMISSION_LABELS for these keys are added
-- separately by the orchestrator; this migration only seeds the DB rows.
--
-- Keys: product.search, pricing.view, uom.manage, target.view, target.manage,
-- reconciliation.view, reconciliation.manage, reconciliation.approve,
-- return.reason.manage, credit.request.create, credit.request.approve,
-- report.aggregate.view (+ pricing.manage re-grants for branch_manager /
-- sales_director / regional_manager).
-- ============================================================================

-- (a) GLOBAL defaults — new tenants + tenants that inherit globals. Only seed
-- for roles that exist in the catalog (defensive).
INSERT INTO erp_role_permissions (role_key, permission)
SELECT g.role_key, g.permission
FROM (VALUES
  -- salesman
  ('salesman', 'product.search'),
  ('salesman', 'credit.request.create'),
  ('salesman', 'reconciliation.view'),
  ('salesman', 'target.view'),
  ('salesman', 'pricing.view'),
  ('salesman', 'report.aggregate.view'),
  -- supervisor (+ inherits the salesman-tier views via its own grants)
  ('supervisor', 'product.search'),
  ('supervisor', 'pricing.view'),
  ('supervisor', 'reconciliation.view'),
  ('supervisor', 'reconciliation.manage'),
  ('supervisor', 'target.view'),
  ('supervisor', 'report.aggregate.view'),
  -- branch_manager
  ('branch_manager', 'product.search'),
  ('branch_manager', 'pricing.view'),
  ('branch_manager', 'pricing.manage'),
  ('branch_manager', 'uom.manage'),
  ('branch_manager', 'reconciliation.view'),
  ('branch_manager', 'reconciliation.manage'),
  ('branch_manager', 'reconciliation.approve'),
  ('branch_manager', 'target.view'),
  ('branch_manager', 'target.manage'),
  ('branch_manager', 'return.reason.manage'),
  ('branch_manager', 'credit.request.approve'),
  ('branch_manager', 'report.aggregate.view'),
  -- accountant
  ('accountant', 'pricing.view'),
  ('accountant', 'credit.request.approve'),
  ('accountant', 'report.aggregate.view'),
  -- warehouse_keeper
  ('warehouse_keeper', 'product.search'),
  ('warehouse_keeper', 'reconciliation.view'),
  ('warehouse_keeper', 'reconciliation.manage'),
  ('warehouse_keeper', 'uom.manage'),
  -- sales_director
  ('sales_director', 'product.search'),
  ('sales_director', 'pricing.view'),
  ('sales_director', 'pricing.manage'),
  ('sales_director', 'target.view'),
  ('sales_director', 'target.manage'),
  ('sales_director', 'report.aggregate.view'),
  -- regional_manager
  ('regional_manager', 'product.search'),
  ('regional_manager', 'pricing.view'),
  ('regional_manager', 'pricing.manage'),
  ('regional_manager', 'target.view'),
  ('regional_manager', 'target.manage'),
  ('regional_manager', 'report.aggregate.view')
) AS g(role_key, permission)
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = g.role_key)
ON CONFLICT (role_key, permission) DO NOTHING;

-- (b) BACKFILL existing company-scoped tenants: grant each mapped permission to
-- every company where that role is ENABLED. Companies without company-scoped
-- config inherit (a). Idempotent.
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, v.role_key, v.permission
FROM (VALUES
  ('salesman', 'product.search'),
  ('salesman', 'credit.request.create'),
  ('salesman', 'reconciliation.view'),
  ('salesman', 'target.view'),
  ('salesman', 'pricing.view'),
  ('salesman', 'report.aggregate.view'),
  ('supervisor', 'product.search'),
  ('supervisor', 'pricing.view'),
  ('supervisor', 'reconciliation.view'),
  ('supervisor', 'reconciliation.manage'),
  ('supervisor', 'target.view'),
  ('supervisor', 'report.aggregate.view'),
  ('branch_manager', 'product.search'),
  ('branch_manager', 'pricing.view'),
  ('branch_manager', 'pricing.manage'),
  ('branch_manager', 'uom.manage'),
  ('branch_manager', 'reconciliation.view'),
  ('branch_manager', 'reconciliation.manage'),
  ('branch_manager', 'reconciliation.approve'),
  ('branch_manager', 'target.view'),
  ('branch_manager', 'target.manage'),
  ('branch_manager', 'return.reason.manage'),
  ('branch_manager', 'credit.request.approve'),
  ('branch_manager', 'report.aggregate.view'),
  ('accountant', 'pricing.view'),
  ('accountant', 'credit.request.approve'),
  ('accountant', 'report.aggregate.view'),
  ('warehouse_keeper', 'product.search'),
  ('warehouse_keeper', 'reconciliation.view'),
  ('warehouse_keeper', 'reconciliation.manage'),
  ('warehouse_keeper', 'uom.manage'),
  ('sales_director', 'product.search'),
  ('sales_director', 'pricing.view'),
  ('sales_director', 'pricing.manage'),
  ('sales_director', 'target.view'),
  ('sales_director', 'target.manage'),
  ('sales_director', 'report.aggregate.view'),
  ('regional_manager', 'product.search'),
  ('regional_manager', 'pricing.view'),
  ('regional_manager', 'pricing.manage'),
  ('regional_manager', 'target.view'),
  ('regional_manager', 'target.manage'),
  ('regional_manager', 'report.aggregate.view')
) AS v(role_key, permission)
JOIN erp_company_roles cr ON cr.role_key = v.role_key AND cr.enabled
ON CONFLICT (company_id, role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_role_permissions WHERE permission IN (
--   'product.search','pricing.view','uom.manage','target.view','target.manage',
--   'reconciliation.view','reconciliation.manage','reconciliation.approve',
--   'return.reason.manage','credit.request.create','credit.request.approve',
--   'report.aggregate.view');
-- DELETE FROM erp_company_role_permissions WHERE permission IN ( ...same list... );
-- (Do NOT delete 'pricing.manage' on rollback — it predates Wave 1.)
