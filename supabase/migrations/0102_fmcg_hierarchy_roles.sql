-- ============================================================================
-- 0102: FMCG hierarchy Slice S2 — new sales-hierarchy roles (role layer only)
-- ----------------------------------------------------------------------------
-- ADDITIVE + idempotent. Adds the FMCG sales-hierarchy roles to the DB catalog
-- (erp_roles), their default permissions (erp_role_permissions), and seeds them
-- into the FMCG business types (erp_business_type_roles for wholesale/delivery).
--
-- Option B (owner-approved): `manager` keeps ALL permissions (legacy admin-
-- equivalent) — UNCHANGED. Branch Manager is the NEW `branch_manager` role, so
-- NO existing tenant/user loses anything. salesman = "Sales Rep" and accountant
-- = "Finance" are LABEL-ONLY changes in the app (no DB change).
--
-- Scope/visibility (region/area/branch) is S4 — NOT in this slice. These roles
-- get broad-but-bounded permissions now; S4 will scope what data they see.
-- Protected verticals untouched.
-- ============================================================================

-- 1) Role catalog (additive)
INSERT INTO erp_roles (key, name_ar, is_system, rank) VALUES
  ('sales_director',          'مدير المبيعات',          true, 7),
  ('national_sales_manager',  'مدير المبيعات الوطني',   true, 7),
  ('regional_manager',        'مدير إقليمي',            true, 6),
  ('area_manager',            'مدير منطقة',             true, 5),
  ('branch_manager',          'مدير الفرع',             true, 6),
  ('it_admin',                'مدير تقنية المعلومات',   true, 6)
ON CONFLICT (key) DO NOTHING;

-- 2) Default permissions per new role (mirrors app ROLE_PERMISSIONS; additive).
INSERT INTO erp_role_permissions (role_key, permission)
SELECT v.role_key, v.permission
FROM (VALUES
  -- Sales Director: full commercial visibility (no settings/billing)
  ('sales_director','sales.sell'),('sales_director','sales.discount'),('sales_director','sales.collect'),
  ('sales_director','sales.return'),('sales_director','customers.manage'),('sales_director','inventory.view'),
  ('sales_director','reports.view'),('sales_director','accounting.view'),('sales_director','stock_request.approve'),
  -- National Sales Manager: same as Director (pre-scope)
  ('national_sales_manager','sales.sell'),('national_sales_manager','sales.discount'),('national_sales_manager','sales.collect'),
  ('national_sales_manager','sales.return'),('national_sales_manager','customers.manage'),('national_sales_manager','inventory.view'),
  ('national_sales_manager','reports.view'),('national_sales_manager','accounting.view'),('national_sales_manager','stock_request.approve'),
  -- Regional Manager: commercial management
  ('regional_manager','sales.sell'),('regional_manager','sales.discount'),('regional_manager','sales.collect'),
  ('regional_manager','sales.return'),('regional_manager','customers.manage'),('regional_manager','inventory.view'),
  ('regional_manager','reports.view'),('regional_manager','stock_request.approve'),
  -- Area Manager: commercial management
  ('area_manager','sales.sell'),('area_manager','sales.discount'),('area_manager','sales.collect'),
  ('area_manager','sales.return'),('area_manager','customers.manage'),('area_manager','inventory.view'),
  ('area_manager','reports.view'),('area_manager','stock_request.approve'),
  -- Branch Manager: branch operations (NO settings/billing — distinct from Admin)
  ('branch_manager','sales.sell'),('branch_manager','sales.discount'),('branch_manager','sales.collect'),
  ('branch_manager','sales.return'),('branch_manager','customers.manage'),('branch_manager','inventory.view'),
  ('branch_manager','inventory.adjust'),('branch_manager','inventory.transfer'),('branch_manager','inventory.count'),
  ('branch_manager','stock_request.approve'),('branch_manager','purchasing.manage'),('branch_manager','suppliers.manage'),
  ('branch_manager','reports.view'),
  -- IT Admin: integrations / scheduler / governance / technical settings
  ('it_admin','integrations.manage'),('it_admin','settings.custom_fields'),('it_admin','workflow.manage'),('it_admin','settings.users')
) AS v(role_key, permission)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_role_permissions e WHERE e.role_key = v.role_key AND e.permission = v.permission
);

-- 3) Seed the new roles into FMCG business types (wholesale + delivery).
INSERT INTO erp_business_type_roles (business_type, role_key)
SELECT v.business_type, v.role_key
FROM (VALUES
  ('wholesale','sales_director'),('wholesale','national_sales_manager'),('wholesale','regional_manager'),
  ('wholesale','area_manager'),('wholesale','branch_manager'),('wholesale','it_admin'),
  ('delivery','sales_director'),('delivery','national_sales_manager'),('delivery','regional_manager'),
  ('delivery','area_manager'),('delivery','branch_manager'),('delivery','it_admin')
) AS v(business_type, role_key)
WHERE EXISTS (SELECT 1 FROM erp_business_type_roles b WHERE b.business_type = v.business_type)
  AND NOT EXISTS (
    SELECT 1 FROM erp_business_type_roles e WHERE e.business_type = v.business_type AND e.role_key = v.role_key
  );
