-- ============================================================================
-- 0060: Wholesale price tiers (مستويات أسعار الجملة)
-- ----------------------------------------------------------------------------
-- A wholesaler sells the same product at different prices by customer level
-- (retail / wholesale / super-wholesale). This adds: price tiers, a per-tier
-- price per product (price list), and a customer→tier assignment. Tenant-scoped
-- (RLS + company_id trigger). Adds a 'wholesale' module + 'wholesale.pricing'
-- permission. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_wholesale_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_wholesale_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES erp_wholesale_tiers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tier_id, product_id)
);

CREATE TABLE IF NOT EXISTS erp_wholesale_customer_tier (
  customer_id UUID PRIMARY KEY REFERENCES erp_customers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  tier_id UUID REFERENCES erp_wholesale_tiers(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_ws_prices_tier ON erp_wholesale_prices(tier_id);
CREATE INDEX IF NOT EXISTS idx_erp_ws_prices_company ON erp_wholesale_prices(company_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_wholesale_tiers','erp_wholesale_prices','erp_wholesale_customer_tier'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;

-- updated_at triggers (tiers + prices)
DROP TRIGGER IF EXISTS erp_wholesale_tiers_updated ON erp_wholesale_tiers;
CREATE TRIGGER erp_wholesale_tiers_updated BEFORE UPDATE ON erp_wholesale_tiers FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP TRIGGER IF EXISTS erp_wholesale_prices_updated ON erp_wholesale_prices;
CREATE TRIGGER erp_wholesale_prices_updated BEFORE UPDATE ON erp_wholesale_prices FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','wholesale.pricing'),('manager','wholesale.pricing')
ON CONFLICT DO NOTHING;
INSERT INTO erp_business_type_modules (business_type, module) VALUES ('wholesale','wholesale')
ON CONFLICT (business_type, module) DO NOTHING;
INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'wholesale' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'wholesale', true FROM erp_companies WHERE business_type='wholesale'
ON CONFLICT (company_id, module) DO NOTHING;
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'wholesale.pricing'
FROM erp_company_roles cr JOIN erp_companies c ON c.id=cr.company_id
WHERE c.business_type='wholesale' AND cr.enabled AND cr.role_key IN ('admin','manager')
ON CONFLICT DO NOTHING;
