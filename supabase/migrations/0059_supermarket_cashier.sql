-- ============================================================================
-- 0059: Supermarket cashier (fast walk-in checkout) — module + permission
-- ----------------------------------------------------------------------------
-- The supermarket already runs on the retail stack (POS / inventory / returns /
-- accounting). This adds a dedicated fast CASHIER checkout that reuses the
-- invoice engine (stock-out + AR/Revenue + cash) but for walk-in sales (a cash
-- customer, change due, no field-rep gating). No new tables — just a 'market'
-- module + 'market.pos' permission wired to the supermarket business type.
-- Safe to re-run.
-- ============================================================================

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','market.pos'),('manager','market.pos'),('cashier','market.pos')
ON CONFLICT DO NOTHING;

INSERT INTO erp_business_type_modules (business_type, module) VALUES ('supermarket','market')
ON CONFLICT (business_type, module) DO NOTHING;

INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'market' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;

INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'market', true FROM erp_companies WHERE business_type='supermarket'
ON CONFLICT (company_id, module) DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'market.pos'
FROM erp_company_roles cr JOIN erp_companies c ON c.id=cr.company_id
WHERE c.business_type='supermarket' AND cr.enabled AND cr.role_key IN ('admin','manager','cashier')
ON CONFLICT DO NOTHING;
