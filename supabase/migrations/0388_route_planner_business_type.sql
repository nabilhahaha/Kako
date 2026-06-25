-- ============================================================================
-- 0388 — "Route Planner / Field Sales" company TEMPLATE (ADDITIVE, idempotent, data-only).
--
-- Packages the Route Planner product line as a selectable business type, mirroring the
-- "Field Verification Only" template (0370). Reuses the existing entitlement registry and the
-- company-insert seeding path (erp_business_type_modules / erp_business_type_roles +
-- erp_seed_company_roles, which copies erp_role_permissions → erp_company_role_permissions for
-- the template's enabled roles). NO new tables/columns, NO trigger changes, NO change to any
-- existing business type, and Field Verification is unaffected.
--
-- Modules enabled for this template:
--   route_management   — Route Planner / Missions / datasets / tracking / reports (canonical
--                        RP Missions path). All RP nav + screens gate on this module.
--   field_verification — supporting module (the rep can also run Field Verification + forms).
--
-- Roles seeded: Admin / Supervisor / Sales Rep (salesman) / Viewer — the same four as the
-- FV-only template. Their route_planner.* permissions are already in the global defaults
-- (0385) and field_verification.* in (0370), so erp_seed_company_roles grants both on company
-- creation. No new role-permission rows are needed here.
-- ============================================================================

-- 1) Template → enabled modules (route_management core + field_verification supporting).
INSERT INTO erp_business_type_modules (business_type, module) VALUES
  ('route_planner', 'route_management'),
  ('route_planner', 'field_verification')
ON CONFLICT (business_type, module) DO NOTHING;

-- 2) Template roles: Admin / Supervisor / Sales Rep / Viewer (standard catalog roles).
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  ('route_planner', 'admin'),
  ('route_planner', 'supervisor'),
  ('route_planner', 'salesman'),
  ('route_planner', 'viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_business_type_roles   WHERE business_type='route_planner';
-- DELETE FROM erp_business_type_modules WHERE business_type='route_planner';
