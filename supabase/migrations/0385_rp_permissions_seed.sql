-- ============================================================================
-- 0385: Route Planner — seed the route_planner.* permissions to real roles (ADDITIVE).
--
-- The Route Planner permissions (route_planner.view/upload/edit/export/execute/admin)
-- were never granted to the standard roles in the global defaults — only a throwaway
-- `test` role held them. As a result a fresh company's roles got NO route_planner.*
-- permissions, and a Salesman/Rep had no path into Route Planner mission execution
-- (they hold neither reports.view nor route_planner.*). This mirrors the forms.* fix
-- (0383) and the field_verification.* grants (0370).
--
--   route_planner.view    → admin, manager, area_manager, supervisor, salesman, driver, viewer
--   route_planner.upload  → admin, manager, area_manager
--   route_planner.edit    → admin, manager, area_manager, supervisor
--   route_planner.export  → admin, manager, area_manager, supervisor, viewer
--   route_planner.execute → admin, manager, area_manager, supervisor, salesman, driver
--   route_planner.admin   → admin
-- (admin/manager also resolve '*' in code; the explicit rows keep the DB authoritative.)
--
-- 1) Global defaults (erp_role_permissions) — picked up by erp_seed_company_roles() for
--    NEW companies (joined to the company's business-type roles).
-- 2) Backfill EXISTING companies that have the route_management module enabled
--    (erp_company_role_permissions), so today's Route-Planner tenants gain clean
--    role-based gating instead of leaning on reports.view. Scoped to route_management so
--    non-distribution tenants (pharmacy/clinic/etc.) are untouched.
--
-- INSERT ... ON CONFLICT DO NOTHING only — purely additive, no UPDATE/DELETE, no data
-- change, no Field Verification behaviour change. Safe to re-run.
-- ============================================================================

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','route_planner.view'),('admin','route_planner.upload'),('admin','route_planner.edit'),
  ('admin','route_planner.export'),('admin','route_planner.execute'),('admin','route_planner.admin'),
  ('manager','route_planner.view'),('manager','route_planner.upload'),('manager','route_planner.edit'),
  ('manager','route_planner.export'),('manager','route_planner.execute'),
  ('area_manager','route_planner.view'),('area_manager','route_planner.upload'),('area_manager','route_planner.edit'),
  ('area_manager','route_planner.export'),('area_manager','route_planner.execute'),
  ('supervisor','route_planner.view'),('supervisor','route_planner.edit'),
  ('supervisor','route_planner.export'),('supervisor','route_planner.execute'),
  ('salesman','route_planner.view'),('salesman','route_planner.execute'),
  ('driver','route_planner.view'),('driver','route_planner.execute'),
  ('viewer','route_planner.view'),('viewer','route_planner.export')
ON CONFLICT (role_key, permission) DO NOTHING;

-- Backfill existing Route-Planner companies (route_management module enabled) with the
-- same role matrix. Additive; never removes anything.
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, m.perm
FROM erp_company_roles cr
JOIN (VALUES
  ('admin','route_planner.view'),('admin','route_planner.upload'),('admin','route_planner.edit'),
  ('admin','route_planner.export'),('admin','route_planner.execute'),('admin','route_planner.admin'),
  ('manager','route_planner.view'),('manager','route_planner.upload'),('manager','route_planner.edit'),
  ('manager','route_planner.export'),('manager','route_planner.execute'),
  ('area_manager','route_planner.view'),('area_manager','route_planner.upload'),('area_manager','route_planner.edit'),
  ('area_manager','route_planner.export'),('area_manager','route_planner.execute'),
  ('supervisor','route_planner.view'),('supervisor','route_planner.edit'),
  ('supervisor','route_planner.export'),('supervisor','route_planner.execute'),
  ('salesman','route_planner.view'),('salesman','route_planner.execute'),
  ('driver','route_planner.view'),('driver','route_planner.execute'),
  ('viewer','route_planner.view'),('viewer','route_planner.export')
) AS m(role_key, perm) ON cr.role_key = m.role_key
WHERE EXISTS (
  SELECT 1 FROM erp_company_modules cm
  WHERE cm.company_id = cr.company_id AND cm.module = 'route_management' AND cm.enabled
)
ON CONFLICT (company_id, role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_company_role_permissions WHERE permission LIKE 'route_planner.%';
-- DELETE FROM erp_role_permissions WHERE permission LIKE 'route_planner.%' AND role_key <> 'test';
