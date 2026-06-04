-- ============================================================================
-- 0036: Per-business-type modules + per-company module overrides
-- ----------------------------------------------------------------------------
-- Until now the visible nav modules (sales/inventory/purchasing/accounting,
-- and the hotel section) were gated only by the subscription PLAN, so a hotel
-- still saw "inventory / stocktake" which makes no sense. This adds:
--   * erp_business_type_modules: which modules a business type shows by default
--   * erp_company_modules: the modules actually enabled for a company (seeded
--     from the type default; the platform owner can toggle them)
-- The app shows a section when it is in the company's modules AND the plan's
-- modules. 'hotel' is now a first-class module too. Additive, safe to re-run.
-- ============================================================================

INSERT INTO erp_plan_modules (plan_key, module)
SELECT key, 'hotel' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;

CREATE TABLE IF NOT EXISTS erp_business_type_modules (
  business_type TEXT NOT NULL,
  module        TEXT NOT NULL,
  PRIMARY KEY (business_type, module)
);

CREATE TABLE IF NOT EXISTS erp_company_modules (
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  module     TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (company_id, module)
);

CREATE INDEX IF NOT EXISTS idx_erp_company_modules_company ON erp_company_modules(company_id);

ALTER TABLE erp_business_type_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_company_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_btm_read" ON erp_business_type_modules;
CREATE POLICY "erp_btm_read" ON erp_business_type_modules FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "erp_btm_owner" ON erp_business_type_modules;
CREATE POLICY "erp_btm_owner" ON erp_business_type_modules FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

DROP POLICY IF EXISTS "erp_company_modules_read" ON erp_company_modules;
CREATE POLICY "erp_company_modules_read" ON erp_company_modules FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS "erp_company_modules_owner" ON erp_company_modules;
CREATE POLICY "erp_company_modules_owner" ON erp_company_modules FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

INSERT INTO erp_business_type_modules (business_type, module) VALUES
  ('general','sales'),('general','inventory'),('general','purchasing'),('general','accounting'),
  ('wholesale','sales'),('wholesale','inventory'),('wholesale','purchasing'),('wholesale','accounting'),
  ('delivery','sales'),('delivery','inventory'),('delivery','purchasing'),('delivery','accounting'),
  ('supermarket','sales'),('supermarket','inventory'),('supermarket','purchasing'),('supermarket','accounting'),
  ('pharmacy','sales'),('pharmacy','inventory'),('pharmacy','purchasing'),('pharmacy','accounting'),
  ('clothing','sales'),('clothing','inventory'),('clothing','purchasing'),('clothing','accounting'),
  ('herbalist','sales'),('herbalist','inventory'),('herbalist','purchasing'),('herbalist','accounting'),
  ('auto_parts','sales'),('auto_parts','inventory'),('auto_parts','purchasing'),('auto_parts','accounting'),
  ('bookstore','sales'),('bookstore','inventory'),('bookstore','purchasing'),('bookstore','accounting'),
  ('electronics','sales'),('electronics','inventory'),('electronics','purchasing'),('electronics','accounting'),
  ('bakery','sales'),('bakery','inventory'),('bakery','purchasing'),('bakery','accounting'),
  ('butchery','sales'),('butchery','inventory'),('butchery','accounting'),
  ('workshop','sales'),('workshop','inventory'),('workshop','accounting'),
  ('restaurant','sales'),('restaurant','inventory'),('restaurant','accounting'),
  ('cafe','sales'),('cafe','inventory'),('cafe','accounting'),
  ('services','sales'),('services','accounting'),
  ('laundry','sales'),('laundry','accounting'),
  ('salon','sales'),('salon','accounting'),
  ('clinic','sales'),('clinic','accounting'),
  ('hotel','hotel'),('hotel','accounting')
ON CONFLICT (business_type, module) DO NOTHING;

CREATE OR REPLACE FUNCTION erp_seed_company_modules(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_btype TEXT;
BEGIN
  SELECT business_type INTO v_btype FROM erp_companies WHERE id = p_company_id;
  IF v_btype IS NOT NULL AND EXISTS (SELECT 1 FROM erp_business_type_modules WHERE business_type = v_btype) THEN
    INSERT INTO erp_company_modules (company_id, module, enabled)
    SELECT p_company_id, m.module, true FROM erp_business_type_modules m
    WHERE m.business_type = v_btype
    ON CONFLICT (company_id, module) DO NOTHING;
  ELSE
    INSERT INTO erp_company_modules (company_id, module, enabled) VALUES
      (p_company_id,'sales',true),(p_company_id,'inventory',true),
      (p_company_id,'purchasing',true),(p_company_id,'accounting',true)
    ON CONFLICT (company_id, module) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION erp_seed_company_roles_trg()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM erp_seed_company_roles(NEW.id);
  PERFORM erp_seed_company_modules(NEW.id);
  RETURN NEW;
END $$;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM erp_companies LOOP
    PERFORM erp_seed_company_modules(c.id);
  END LOOP;
END $$;
