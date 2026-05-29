-- ============================================================================
-- 0022: Business-type role templates
-- ----------------------------------------------------------------------------
-- A pharmacy, a restaurant and a food distributor need different roles active.
-- This defines, per business_type, which roles are enabled by default. When a
-- company is created, erp_seed_company_roles() applies the template matching
-- its business_type (default permissions are copied per enabled role), falling
-- back to "all roles" for any type without a template. Additive, safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_business_type_roles (
  business_type TEXT NOT NULL,
  role_key      TEXT NOT NULL REFERENCES erp_roles(key) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (business_type, role_key)
);

ALTER TABLE erp_business_type_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_business_type_roles_read" ON erp_business_type_roles;
CREATE POLICY "erp_business_type_roles_read" ON erp_business_type_roles FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "erp_business_type_roles_owner" ON erp_business_type_roles;
CREATE POLICY "erp_business_type_roles_owner" ON erp_business_type_roles FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());

-- ─── Seed templates: which roles are enabled per business type ──────────────
-- admin + manager are enabled for every type; the rest are tailored.
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  -- general / متنوع: everything
  ('general','admin'),('general','manager'),('general','supervisor'),('general','accountant'),
  ('general','cashier'),('general','salesman'),('general','warehouse_keeper'),('general','staff'),('general','viewer'),
  -- wholesale / توزيع جملة: full field + warehouse operation
  ('wholesale','admin'),('wholesale','manager'),('wholesale','supervisor'),('wholesale','accountant'),
  ('wholesale','cashier'),('wholesale','salesman'),('wholesale','warehouse_keeper'),('wholesale','staff'),('wholesale','viewer'),
  -- supermarket: counter + warehouse, no field salesman
  ('supermarket','admin'),('supermarket','manager'),('supermarket','supervisor'),('supermarket','accountant'),
  ('supermarket','cashier'),('supermarket','warehouse_keeper'),('supermarket','staff'),('supermarket','viewer'),
  -- pharmacy: counter + stock + accounting, no field salesman/supervisor
  ('pharmacy','admin'),('pharmacy','manager'),('pharmacy','accountant'),
  ('pharmacy','cashier'),('pharmacy','warehouse_keeper'),('pharmacy','viewer'),
  -- clothing: counter + stock + accounting
  ('clothing','admin'),('clothing','manager'),('clothing','accountant'),
  ('clothing','cashier'),('clothing','warehouse_keeper'),('clothing','viewer'),
  -- restaurant: counter + accounting + staff
  ('restaurant','admin'),('restaurant','manager'),('restaurant','accountant'),
  ('restaurant','cashier'),('restaurant','staff'),('restaurant','viewer'),
  -- cafe: lean counter + staff
  ('cafe','admin'),('cafe','manager'),('cafe','cashier'),('cafe','staff'),('cafe','viewer'),
  -- services: counter + accounting + staff
  ('services','admin'),('services','manager'),('services','accountant'),
  ('services','cashier'),('services','staff'),('services','viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;

-- ─── Update the seeding function to honour business-type templates ──────────
CREATE OR REPLACE FUNCTION erp_seed_company_roles(p_company_id UUID)
RETURNS void AS $$
DECLARE v_btype TEXT;
BEGIN
  SELECT business_type INTO v_btype FROM erp_companies WHERE id = p_company_id;

  IF v_btype IS NOT NULL AND EXISTS (
    SELECT 1 FROM erp_business_type_roles WHERE business_type = v_btype
  ) THEN
    -- Template path: enable only the roles defined for this business type.
    INSERT INTO erp_company_roles (company_id, role_key, enabled)
    SELECT p_company_id, btr.role_key, btr.enabled
    FROM erp_business_type_roles btr
    WHERE btr.business_type = v_btype
    ON CONFLICT (company_id, role_key) DO NOTHING;

    -- Copy default permissions for the enabled roles only.
    INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
    SELECT p_company_id, rp.role_key, rp.permission
    FROM erp_role_permissions rp
    JOIN erp_business_type_roles btr
      ON btr.role_key = rp.role_key
     AND btr.business_type = v_btype
     AND btr.enabled
    ON CONFLICT DO NOTHING;
  ELSE
    -- Fallback: enable all catalog roles with their default permissions.
    INSERT INTO erp_company_roles (company_id, role_key, enabled)
    SELECT p_company_id, r.key, true FROM erp_roles r
    ON CONFLICT (company_id, role_key) DO NOTHING;

    INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
    SELECT p_company_id, rp.role_key, rp.permission FROM erp_role_permissions rp
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
