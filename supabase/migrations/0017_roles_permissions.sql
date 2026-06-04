-- ============================================================================
-- 0017: DB-backed roles & permissions (editable + custom roles)
-- ----------------------------------------------------------------------------
-- Moves the role→permission matrix into the database so admins can edit role
-- permissions and add custom roles. Built-in roles are seeded from the app
-- defaults (is_system = true). Safe to re-run (ON CONFLICT DO NOTHING keeps
-- any admin edits).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_roles (
  key         TEXT PRIMARY KEY,
  name_ar     TEXT NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  rank        INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_role_permissions (
  role_key    TEXT NOT NULL REFERENCES erp_roles(key) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  PRIMARY KEY (role_key, permission)
);

ALTER TABLE erp_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_role_permissions ENABLE ROW LEVEL SECURITY;

-- Any authenticated user may read roles/permissions (needed to resolve access);
-- only super admins may modify them.
DROP POLICY IF EXISTS "erp_roles_read" ON erp_roles;
CREATE POLICY "erp_roles_read" ON erp_roles FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "erp_roles_admin" ON erp_roles;
CREATE POLICY "erp_roles_admin" ON erp_roles FOR ALL USING (erp_is_super_admin()) WITH CHECK (erp_is_super_admin());

DROP POLICY IF EXISTS "erp_role_permissions_read" ON erp_role_permissions;
CREATE POLICY "erp_role_permissions_read" ON erp_role_permissions FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "erp_role_permissions_admin" ON erp_role_permissions;
CREATE POLICY "erp_role_permissions_admin" ON erp_role_permissions FOR ALL USING (erp_is_super_admin()) WITH CHECK (erp_is_super_admin());

-- ─── Seed built-in roles ──────────────────────────────────────────────────
INSERT INTO erp_roles (key, name_ar, is_system, rank) VALUES
  ('admin',            'مدير النظام',   true, 8),
  ('manager',          'مدير الفرع',    true, 7),
  ('supervisor',       'مشرف مبيعات',   true, 6),
  ('accountant',       'محاسب',         true, 5),
  ('warehouse_keeper', 'أمين المخزن',   true, 4),
  ('cashier',          'أمين الصندوق',  true, 3),
  ('salesman',         'مندوب مبيعات',  true, 2),
  ('staff',            'موظف',          true, 1),
  ('viewer',           'مشاهد فقط',     true, 0)
ON CONFLICT (key) DO NOTHING;

-- ─── Seed default permissions ───────────────────────────────────────────────
-- admin + manager: all permissions.
INSERT INTO erp_role_permissions (role_key, permission)
SELECT r.key, p.permission
FROM (VALUES ('admin'), ('manager')) AS r(key)
CROSS JOIN (VALUES
  ('sales.sell'),('sales.discount'),('sales.collect'),('sales.return'),
  ('customers.manage'),('inventory.view'),('inventory.adjust'),('inventory.transfer'),
  ('inventory.count'),('stock_request.create'),('stock_request.approve'),
  ('purchasing.manage'),('suppliers.manage'),('accounting.view'),('accounting.post'),
  ('settings.branches'),('settings.users'),('reports.view')
) AS p(permission)
ON CONFLICT DO NOTHING;

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('supervisor','sales.sell'),('supervisor','sales.discount'),('supervisor','sales.collect'),
  ('supervisor','sales.return'),('supervisor','customers.manage'),('supervisor','inventory.view'),
  ('supervisor','stock_request.approve'),('supervisor','reports.view'),
  ('accountant','accounting.view'),('accountant','accounting.post'),('accountant','reports.view'),
  ('accountant','suppliers.manage'),('accountant','sales.collect'),
  ('cashier','sales.sell'),('cashier','sales.collect'),('cashier','customers.manage'),
  ('salesman','sales.sell'),('salesman','sales.collect'),('salesman','customers.manage'),
  ('salesman','inventory.view'),('salesman','stock_request.create'),
  ('warehouse_keeper','inventory.view'),('warehouse_keeper','inventory.adjust'),
  ('warehouse_keeper','inventory.transfer'),('warehouse_keeper','inventory.count'),
  ('warehouse_keeper','stock_request.approve'),('warehouse_keeper','purchasing.manage'),
  ('staff','inventory.view'),
  ('viewer','reports.view'),('viewer','accounting.view'),('viewer','inventory.view')
ON CONFLICT DO NOTHING;
