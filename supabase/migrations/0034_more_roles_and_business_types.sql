-- ============================================================================
-- 0034: More roles + more business-type templates
-- ----------------------------------------------------------------------------
-- Adds service-oriented roles (technician, doctor, receptionist, stylist) and
-- a batch of new business-type templates (bakery, butchery, herbalist,
-- auto_parts, bookstore, electronics, laundry, workshop, clinic, salon).
-- Retail types stay cashier-centric (point of sale = cashier); service types
-- get the appropriate professional role. Additive, safe to re-run.
-- ============================================================================

-- ─── New catalogue roles ────────────────────────────────────────────────────
INSERT INTO erp_roles (key, name_ar, is_system, rank) VALUES
  ('technician',   'فني',            true, 3),
  ('doctor',       'طبيب',           true, 6),
  ('receptionist', 'موظف استقبال',   true, 2),
  ('stylist',      'أخصائي تجميل',   true, 3)
ON CONFLICT (key) DO NOTHING;

-- Default permissions for the new roles.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  -- technician: does the service job, can invoice it, sees stock, requests parts
  ('technician','customers.manage'),('technician','sales.sell'),
  ('technician','inventory.view'),('technician','stock_request.create'),
  -- doctor: manages patients, bills the visit, sees reports
  ('doctor','customers.manage'),('doctor','sales.sell'),('doctor','reports.view'),
  -- receptionist: front desk — books, sells, collects
  ('receptionist','customers.manage'),('receptionist','sales.sell'),('receptionist','sales.collect'),
  -- stylist: serves the client and rings the service
  ('stylist','customers.manage'),('stylist','sales.sell')
ON CONFLICT DO NOTHING;

-- ─── New business-type templates ────────────────────────────────────────────
INSERT INTO erp_business_type_roles (business_type, role_key) VALUES
  -- bakery / patisserie: production (staff) + counter (cashier) + stock + books
  ('bakery','admin'),('bakery','manager'),('bakery','cashier'),
  ('bakery','staff'),('bakery','warehouse_keeper'),('bakery','accountant'),('bakery','viewer'),
  -- butchery / fish / greengrocer: counter + helper + stock
  ('butchery','admin'),('butchery','manager'),('butchery','cashier'),
  ('butchery','staff'),('butchery','warehouse_keeper'),('butchery','viewer'),
  -- herbalist / cosmetics: like pharmacy (counter + stock + books)
  ('herbalist','admin'),('herbalist','manager'),('herbalist','cashier'),
  ('herbalist','warehouse_keeper'),('herbalist','accountant'),('herbalist','viewer'),
  -- auto parts / accessories: counter + stock + books
  ('auto_parts','admin'),('auto_parts','manager'),('auto_parts','cashier'),
  ('auto_parts','warehouse_keeper'),('auto_parts','accountant'),('auto_parts','viewer'),
  -- bookstore / stationery: counter + helper + stock
  ('bookstore','admin'),('bookstore','manager'),('bookstore','cashier'),
  ('bookstore','warehouse_keeper'),('bookstore','staff'),('bookstore','viewer'),
  -- mobiles / electronics: counter + technician + stock + books
  ('electronics','admin'),('electronics','manager'),('electronics','cashier'),
  ('electronics','technician'),('electronics','warehouse_keeper'),('electronics','accountant'),('electronics','viewer'),
  -- laundry / dry-clean: front desk (cashier) + workers (staff)
  ('laundry','admin'),('laundry','manager'),('laundry','cashier'),
  ('laundry','staff'),('laundry','viewer'),
  -- repair workshop: technicians + counter + parts stock + books
  ('workshop','admin'),('workshop','manager'),('workshop','technician'),
  ('workshop','cashier'),('workshop','warehouse_keeper'),('workshop','accountant'),('workshop','viewer'),
  -- clinic / medical center: doctors + reception + cashier + books
  ('clinic','admin'),('clinic','manager'),('clinic','doctor'),
  ('clinic','receptionist'),('clinic','cashier'),('clinic','accountant'),('clinic','viewer'),
  -- salon / beauty center: stylists + reception + cashier
  ('salon','admin'),('salon','manager'),('salon','stylist'),
  ('salon','receptionist'),('salon','cashier'),('salon','viewer')
ON CONFLICT (business_type, role_key) DO NOTHING;
