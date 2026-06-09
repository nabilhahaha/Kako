-- ============================================================================
-- 0264: Entitlement Engine — E2: module/feature catalog seed
-- ----------------------------------------------------------------------------
-- Seeds the GLOBAL module catalog (core modules + the platform engines the owner
-- enables per company) and a representative set of features for the engines.
-- Pure metadata; entitlements (per-company enablement) are set by the platform
-- owner later. The KAKO_ENTITLEMENTS flag remains the gate. Idempotent, additive.
-- ============================================================================

INSERT INTO erp_modules (module_key, label_en, label_ar, category, platform_flag, manage_permission, sort) VALUES
  ('sales',           'Sales',            'المبيعات',          'core',   NULL,                    'sales.sell',         10),
  ('inventory',       'Inventory',        'المخزون',           'core',   NULL,                    'inventory.view',     20),
  ('purchasing',      'Purchasing',       'المشتريات',         'core',   NULL,                    'purchasing.manage',  30),
  ('accounting',      'Accounting',       'المحاسبة',          'core',   NULL,                    'accounting.view',    40),
  ('crm',             'CRM',              'إدارة العملاء',     'core',   NULL,                    'customers.manage',   50),
  ('route_management','Route Management', 'إدارة خطوط السير',  'engine', 'KAKO_ROUTE_OPTIMIZATION','route.create',      60),
  ('van_sales',       'Van Sales',        'مبيعات الشاحنة',    'engine', 'KAKO_VAN_SALES',        'settings.branches',  70),
  ('trade_spend',     'Trade Spend',      'الإنفاق التجاري',   'engine', 'KAKO_TRADE_SPEND',      'accounting.view',    80),
  ('merchandising',   'Merchandising',    'التسويق الميداني',  'engine', 'KAKO_PERFECT_STORE',    'field.sales',        90),
  ('change_requests', 'Change Requests',  'طلبات التغيير',     'engine', 'KAKO_CHANGE_REQUESTS',  'customers.manage',  100),
  ('critical_alerts', 'Critical Alerts',  'التنبيهات الحرجة',  'engine', 'KAKO_ALERTS',           'settings.branches', 110)
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO erp_features (module_key, feature_key, label_en, label_ar, permission) VALUES
  ('van_sales',       'physical_count',  'Require physical count on close', 'إلزام الجرد عند الإغلاق', NULL),
  ('van_sales',       'direct_load',     'Supervisor-direct load',          'تحميل المشرف المباشر',    NULL),
  ('van_sales',       'variance_review', 'Variance review',                 'مراجعة الفروقات',         NULL),
  ('change_requests', 'effective_dating','Effective dating',                'التأريخ الفعّال',         NULL),
  ('change_requests', 'bulk',            'Bulk change requests',            'طلبات التغيير بالجملة',   NULL),
  ('change_requests', 'external_hooks',  'External approval hooks',         'اعتمادات خارجية',         NULL),
  ('critical_alerts', 'email_channel',   'Email notifications',             'إشعارات البريد',          NULL),
  ('route_management','geofencing',      'Route geofencing',                'السياج الجغرافي',         NULL)
ON CONFLICT (module_key, feature_key) DO NOTHING;

-- ── Rollback (manual): DELETE FROM erp_features; DELETE FROM erp_modules; ────
