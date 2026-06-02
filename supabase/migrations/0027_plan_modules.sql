-- ============================================================================
-- 0027: Plan-based module gating
-- ----------------------------------------------------------------------------
-- Each plan unlocks a set of feature modules (sales / inventory / purchasing /
-- accounting). The app hides nav sections whose module is not in the company's
-- plan. Dashboard, settings and the vendor panel are always available.
-- Standard/pro/unlimited get the full set, so existing tenants are unaffected;
-- only the free plan is trimmed. Additive, safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_plan_modules (
  plan_key TEXT NOT NULL REFERENCES erp_plans(key) ON DELETE CASCADE,
  module   TEXT NOT NULL,
  PRIMARY KEY (plan_key, module)
);

ALTER TABLE erp_plan_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_plan_modules_read" ON erp_plan_modules;
CREATE POLICY "erp_plan_modules_read" ON erp_plan_modules FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "erp_plan_modules_owner" ON erp_plan_modules;
CREATE POLICY "erp_plan_modules_owner" ON erp_plan_modules FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

INSERT INTO erp_plan_modules (plan_key, module) VALUES
  ('free','sales'),('free','inventory'),
  ('standard','sales'),('standard','inventory'),('standard','purchasing'),('standard','accounting'),
  ('pro','sales'),('pro','inventory'),('pro','purchasing'),('pro','accounting'),
  ('unlimited','sales'),('unlimited','inventory'),('unlimited','purchasing'),('unlimited','accounting')
ON CONFLICT (plan_key, module) DO NOTHING;
