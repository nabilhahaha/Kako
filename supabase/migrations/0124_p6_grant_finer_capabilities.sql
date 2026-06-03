-- ============================================================================
-- 0124: Authorization Phase 6 (P6) — Grant the net-new finer capabilities
-- ----------------------------------------------------------------------------
-- ACTIVATION step (intentionally NOT cutover-neutral): the eight deny-all finer
-- capabilities (capabilities.ts) become grantable + are seeded to a LEAST-
-- PRIVILEGE, role-based default matrix. They are stored exactly like flat
-- permissions — a (role_key, permission) row — so can()/expandAliases() resolve
-- them with no other change.
--
-- Principle (product direction): least privilege, role-based ownership — NOT
-- "grant everything to every manager". The Company Admin (owner) holds all eight;
-- each other role receives ONLY the capabilities it functionally owns; the
-- generic `manager` role gets NONE (admins delegate explicitly via the console).
-- Role substitutions where no dedicated role exists: Finance Manager → accountant;
-- Purchasing Manager → branch_manager; Warehouse Manager → warehouse_keeper.
--
-- Default matrix:
--   admin            → all 8 (incl. customers.delete, only admin)
--   accountant       → sales.payment.writeoff, sales.invoice.cancel, accounting.voucher.approve
--   branch_manager   → sales.order.cancel, purchasing.po.approve
--   warehouse_keeper → inventory.adjustment.approve
--   sales_director   → sales.price.override
--   regional_manager → sales.price.override
--
-- Applies to (a) the GLOBAL default template erp_role_permissions (so new /
-- inheriting tenants get it, including via erp_seed_company_roles on creation),
-- and (b) a BACKFILL into erp_company_role_permissions for every existing
-- company-scoped tenant where the mapped role is enabled. Idempotent.
-- ============================================================================

-- The least-privilege grant matrix as (role_key, permission) pairs.
CREATE TEMP TABLE _p6_grants(role_key text, permission text) ON COMMIT DROP;
INSERT INTO _p6_grants(role_key, permission) VALUES
  ('admin', 'customers.delete'),
  ('admin', 'sales.price.override'),
  ('admin', 'sales.payment.writeoff'),
  ('admin', 'purchasing.po.approve'),
  ('admin', 'inventory.adjustment.approve'),
  ('admin', 'sales.order.cancel'),
  ('admin', 'sales.invoice.cancel'),
  ('admin', 'accounting.voucher.approve'),
  ('accountant', 'sales.payment.writeoff'),
  ('accountant', 'sales.invoice.cancel'),
  ('accountant', 'accounting.voucher.approve'),
  ('branch_manager', 'sales.order.cancel'),
  ('branch_manager', 'purchasing.po.approve'),
  ('warehouse_keeper', 'inventory.adjustment.approve'),
  ('sales_director', 'sales.price.override'),
  ('regional_manager', 'sales.price.override');

-- (a) GLOBAL defaults — new tenants + tenants that inherit globals. Only seed for
-- roles that exist in the catalog (defensive).
INSERT INTO erp_role_permissions (role_key, permission)
SELECT g.role_key, g.permission
FROM _p6_grants g
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = g.role_key)
ON CONFLICT (role_key, permission) DO NOTHING;

-- (b) BACKFILL existing company-scoped tenants: grant each mapped capability to
-- every company where that role is ENABLED (so a company that customizes its
-- roles — and therefore resolves from erp_company_role_permissions — also gets
-- the new authority). Companies without company-scoped config inherit (a).
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, g.role_key, g.permission
FROM _p6_grants g
JOIN erp_company_roles cr ON cr.role_key = g.role_key AND cr.enabled
ON CONFLICT (company_id, role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_role_permissions WHERE (role_key, permission) IN (
--   ('admin','customers.delete'), ('admin','sales.price.override'), ... );
-- DELETE FROM erp_company_role_permissions WHERE (role_key, permission) IN ( ... );
