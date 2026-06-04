-- ============================================================================
-- 0023: Subscription plans & per-tenant limits
-- ----------------------------------------------------------------------------
-- Each company is on a plan that caps how many users / branches / products it
-- can have. NULL limit = unlimited. Enforced in the app's server actions.
-- Additive, safe to re-run. Existing companies default to 'standard'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_plans (
  key           TEXT PRIMARY KEY,
  name_ar       TEXT NOT NULL,
  max_users     INTEGER,          -- NULL = unlimited
  max_branches  INTEGER,
  max_products  INTEGER,
  rank          INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE erp_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_plans_read" ON erp_plans;
CREATE POLICY "erp_plans_read" ON erp_plans FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "erp_plans_owner" ON erp_plans;
CREATE POLICY "erp_plans_owner" ON erp_plans FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

INSERT INTO erp_plans (key, name_ar, max_users, max_branches, max_products, rank) VALUES
  ('free',      'مجانية',   3,    1,    100,  0),
  ('standard',  'أساسية',   15,   5,    2000, 1),
  ('pro',       'احترافية', 50,   20,   20000, 2),
  ('unlimited', 'غير محدودة', NULL, NULL, NULL, 3)
ON CONFLICT (key) DO NOTHING;

-- Attach a plan to every company.
ALTER TABLE erp_companies ADD COLUMN IF NOT EXISTS plan_key TEXT REFERENCES erp_plans(key);
UPDATE erp_companies SET plan_key = 'standard' WHERE plan_key IS NULL;
ALTER TABLE erp_companies ALTER COLUMN plan_key SET DEFAULT 'standard';
