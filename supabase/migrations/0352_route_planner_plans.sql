-- ============================================================================
-- 0352: Route Planner product plans
-- ----------------------------------------------------------------------------
-- The standalone Route Planner marks its tenants with a plan_key prefixed
-- `route_planner` (trial / monthly / annual), and the Route Planner Admin Console
-- creates companies with `route_planner_trial`. Because erp_companies.plan_key is a
-- FK to erp_plans(key), those keys MUST exist — otherwise the insert fails with a
-- foreign-key violation (23503). This registers them.
--
-- Limits are NULL (unlimited): the Route Planner is session-only and does not enforce
-- user / branch / product caps. Additive + idempotent.
-- ============================================================================

INSERT INTO erp_plans (key, name_ar, max_users, max_branches, max_products, rank) VALUES
  ('route_planner_trial',   'مخطط الخطوط — تجربة',  NULL, NULL, NULL, 0),
  ('route_planner_monthly', 'مخطط الخطوط — شهري',   NULL, NULL, NULL, 0),
  ('route_planner_annual',  'مخطط الخطوط — سنوي',   NULL, NULL, NULL, 0)
ON CONFLICT (key) DO NOTHING;
