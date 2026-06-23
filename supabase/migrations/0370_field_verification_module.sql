-- ============================================================================
-- 0370 — Package "Field Customer Verification" as a standalone MODULE + a
-- "Field Verification Only" company TEMPLATE. ADDITIVE, idempotent, data-only
-- (NO new tables/columns, NO trigger changes). Reuses the existing entitlement
-- registry (erp_modules), business-type template (erp_business_type_modules /
-- erp_business_type_roles + erp_seed_company_roles), and permission catalog
-- (erp_role_permissions → copied into erp_company_role_permissions on company
-- creation). Staging only. Reverse: delete the seeded rows by their keys.
-- ============================================================================

-- 1) Register the standalone engine module (mirrors route_management; owner-enabled
--    per company via erp_company_modules; gated in nav by the `field_verification` key).
INSERT INTO erp_modules (module_key, label_en, label_ar, category, platform_flag, manage_permission, sort) VALUES
  ('field_verification', 'Field Verification', 'التحقق الميداني من العملاء', 'engine', 'KAKO_FIELD_VERIFICATION', 'field_verification.admin', 65)
ON CONFLICT (module_key) DO NOTHING;

-- 2) "Field Verification Only" template → enable ONLY the field_verification module
--    (no Sales/Inventory/POS/Billing/Collections/Accounting/Pharmacy/Van Sales/
--    Trade Spend/Merchandising). The company-insert seeding path uses this.
INSERT INTO erp_business_type_modules (business_type, module) VALUES
  ('field_verification_only', 'field_verification')
ON CONFLICT (business_type, module) DO NOTHING;

-- 3) Template roles for the FV-only company: Admin / Supervisor / Sales Rep / Viewer.
--    (role_key references erp_roles(key); these are standard catalog roles.)
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  ('field_verification_only', 'admin'),
  ('field_verification_only', 'supervisor'),
  ('field_verification_only', 'salesman'),
  ('field_verification_only', 'viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;

-- 4) GLOBAL default permissions per role (erp_role_permissions). erp_seed_company_roles()
--    copies these into erp_company_role_permissions for the template's enabled roles when
--    a company is created — so an FV-only company's roles get exactly these capabilities.
--    Runtime permission resolution is DB-driven (auth-context), so this is what grants access.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  -- Company Admin → full module access
  ('admin', 'field_verification.view'),
  ('admin', 'field_verification.upload'),
  ('admin', 'field_verification.assign'),
  ('admin', 'field_verification.verify'),
  ('admin', 'field_verification.catalog_manage'),
  ('admin', 'field_verification.radius_manage'),
  ('admin', 'field_verification.reports'),
  ('admin', 'field_verification.export'),
  ('admin', 'field_verification.admin'),
  -- Manager → same as admin within the module (mirrors admin/manager parity elsewhere)
  ('manager', 'field_verification.view'),
  ('manager', 'field_verification.upload'),
  ('manager', 'field_verification.assign'),
  ('manager', 'field_verification.verify'),
  ('manager', 'field_verification.catalog_manage'),
  ('manager', 'field_verification.radius_manage'),
  ('manager', 'field_verification.reports'),
  ('manager', 'field_verification.export'),
  -- Field Supervisor → team reports + assignment
  ('supervisor', 'field_verification.view'),
  ('supervisor', 'field_verification.assign'),
  ('supervisor', 'field_verification.reports'),
  -- Sales Rep / Field User → mobile verification only (own assigned customers; enforced server-side)
  ('salesman', 'field_verification.view'),
  ('salesman', 'field_verification.verify'),
  -- Viewer → read-only reports
  ('viewer', 'field_verification.view'),
  ('viewer', 'field_verification.reports')
ON CONFLICT (role_key, permission) DO NOTHING;
