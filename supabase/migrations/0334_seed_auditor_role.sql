-- 0334: Seed the Auditor role into the global catalog — pre-pilot finding D1.
--
-- The `auditor` role existed in the TypeScript matrix (ROLE_PERMISSIONS) but was
-- absent from the database role catalog (erp_roles) and the global default
-- permission map (erp_role_permissions). Consequences on a real tenant:
--   • assigning `auditor` to a user violated erp_company_roles → erp_roles FK;
--   • even if assigned, an auditor resolved ZERO permissions via erp_user_has_perm
--     (no company-specific config + no global rows), blocking the read/oversight
--     surfaces the role is meant to have.
-- This migration registers the role and seeds its documented read-only permission
-- set globally, so auditor is assignable and resolves correctly on any tenant that
-- has no company-specific role configuration. Purely additive: a catalog row + 11
-- permission rows. No workflow, UI, or architecture change; grants read/oversight
-- only (no mutating permission).

INSERT INTO erp_roles(key, name_ar, is_system, rank)
VALUES ('auditor', 'مدقق', true, COALESCE((SELECT rank FROM erp_roles WHERE key='viewer'), 0))
ON CONFLICT (key) DO NOTHING;

INSERT INTO erp_role_permissions(role_key, permission)
SELECT 'auditor', p FROM (VALUES
  ('reports.view'),('accounting.view'),('inventory.view'),('stock.view'),
  ('returns.view_all'),('reconciliation.view'),('customers.view_balance'),
  ('customers.view_credit'),('cash.view_outstanding'),('audit.view'),('documents.export')
) AS v(p)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_role_permissions x WHERE x.role_key='auditor' AND x.permission=v.p
);
