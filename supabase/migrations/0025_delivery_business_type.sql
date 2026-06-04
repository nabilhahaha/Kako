-- ============================================================================
-- 0025: Delivery business type + driver role
-- ----------------------------------------------------------------------------
-- Adds a dedicated "driver / courier" role and a "delivery" business-type
-- template (dispatch via supervisor, COD via cashier, depot via warehouse).
-- The driver role is also enabled by default for wholesale & general (van
-- last-mile). Additive, safe to re-run.
-- ============================================================================

-- New catalogue role: driver / courier.
INSERT INTO erp_roles (key, name_ar, is_system, rank) VALUES
  ('driver', 'سائق / مندوب توصيل', true, 2)
ON CONFLICT (key) DO NOTHING;

-- Default permissions for a delivery driver: deliver orders, collect COD,
-- see customers & stock, request a van load.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('driver','sales.sell'),
  ('driver','sales.collect'),
  ('driver','customers.manage'),
  ('driver','inventory.view'),
  ('driver','stock_request.create')
ON CONFLICT DO NOTHING;

-- Delivery template.
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  ('delivery','admin'),('delivery','manager'),('delivery','supervisor'),
  ('delivery','driver'),('delivery','cashier'),('delivery','accountant'),
  ('delivery','warehouse_keeper'),('delivery','viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;

-- Make the driver role available by default where vans do last-mile delivery.
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  ('wholesale','driver'),
  ('general','driver')
ON CONFLICT (business_type, role_key) DO NOTHING;
