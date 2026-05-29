-- ============================================================================
-- 0043: Separate field-sales features from counter sales
-- ----------------------------------------------------------------------------
-- The rep app, daily rep settlement, and visit/journey planning are FIELD
-- features (a salesman/driver visiting customers). They were gated by
-- 'sales.sell', which the cashier also has — so a pharmacy cashier wrongly saw
-- "تطبيق المندوب". Introduce a dedicated 'field.sales' permission granted only
-- to the field roles (salesman, driver), and gate those nav items by it.
-- Idempotent.
-- ============================================================================

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('salesman','field.sales'),
  ('driver','field.sales')
ON CONFLICT DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'field.sales'
FROM erp_company_roles cr
WHERE cr.role_key IN ('salesman','driver') AND cr.enabled
ON CONFLICT DO NOTHING;
