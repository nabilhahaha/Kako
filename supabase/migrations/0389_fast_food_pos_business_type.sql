-- ============================================================================
-- 0389 — "Fast Food / Restaurant POS" company TEMPLATE (ADDITIVE, idempotent, data-only).
--
-- Packages the new fast POS as a selectable business type for snack shops / QSR / small food
-- outlets, mirroring the restaurant/cafe templates. The Fast POS screen itself lives inside
-- the existing RESTAURANT module (it reuses erp_restaurant_orders / erp_restaurant_order_items
-- / erp_close_restaurant_order, the product catalog, the scanner, and the restaurant receipt),
-- so this template just enables the right modules + roles. No new tables/columns, no trigger
-- changes; restaurant/cafe/bakery and every other business type are unchanged; Field
-- Verification and Route Planner are untouched.
--
-- Modules: restaurant (POS + orders + kitchen), sales + inventory + accounting (catalog,
-- stock, GL posting via the checkout RPC), analytics + pos (reporting / cashier surfaces).
-- Roles: Admin / Manager / Cashier / Supervisor / Viewer. Their permissions are already in
-- the global defaults (cashier holds restaurant.manage; supervisor/viewer hold reports.view),
-- so erp_seed_company_roles grants the right capabilities on company creation — no new
-- role-permission rows are needed here.
-- ============================================================================

INSERT INTO erp_business_type_modules (business_type, module) VALUES
  ('fast_food', 'restaurant'),
  ('fast_food', 'sales'),
  ('fast_food', 'inventory'),
  ('fast_food', 'accounting'),
  ('fast_food', 'analytics'),
  ('fast_food', 'pos')
ON CONFLICT (business_type, module) DO NOTHING;

INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  ('fast_food', 'admin'),
  ('fast_food', 'manager'),
  ('fast_food', 'cashier'),
  ('fast_food', 'supervisor'),
  ('fast_food', 'viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_business_type_roles   WHERE business_type='fast_food';
-- DELETE FROM erp_business_type_modules WHERE business_type='fast_food';
