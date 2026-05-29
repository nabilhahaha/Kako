-- ============================================================================
-- 0058: Laundry module (services, orders with a wash workflow, checkout)
-- ----------------------------------------------------------------------------
-- A laundry vertical: a price list of garment/service types, customer orders
-- built from them, and a status flow received → washing → ready → delivered.
-- Checkout totals (items − discount + delivery), marks delivered, and posts
-- Debit Cash/Bank / Credit Service Revenue (4200). Tenant-scoped (RLS +
-- company_id trigger). Adds a 'laundry' module + 'laundry.manage'. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_laundry_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, price NUMERIC NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_laundry_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  customer_name TEXT, customer_phone TEXT, customer_address TEXT,
  status TEXT NOT NULL DEFAULT 'received',  -- received | washing | ready | delivered | cancelled
  is_delivery BOOLEAN NOT NULL DEFAULT false, delivery_fee NUMERIC NOT NULL DEFAULT 0,
  discount_value NUMERIC NOT NULL DEFAULT 0, total NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT, due_date DATE, notes TEXT, created_by UUID, delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_laundry_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES erp_laundry_orders(id) ON DELETE CASCADE,
  service_id UUID REFERENCES erp_laundry_services(id) ON DELETE SET NULL,
  name TEXT NOT NULL, qty NUMERIC NOT NULL DEFAULT 1, price NUMERIC NOT NULL DEFAULT 0, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_laundry_services_company ON erp_laundry_services(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_laundry_orders_company ON erp_laundry_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_laundry_orders_status ON erp_laundry_orders(status);
CREATE INDEX IF NOT EXISTS idx_erp_laundry_items_order ON erp_laundry_order_items(order_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_laundry_services','erp_laundry_orders','erp_laundry_order_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION erp_close_laundry_order(p_order_id UUID, p_payment_method TEXT DEFAULT 'cash')
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID; v_branch UUID; v_status TEXT; v_delivery NUMERIC; v_disc NUMERIC;
  v_sub NUMERIC; v_total NUMERIC; v_method TEXT := CASE WHEN p_payment_method='card' THEN 'card' ELSE 'cash' END;
  v_cash UUID; v_rev UUID; v_entry UUID; v_uid UUID := auth.uid();
BEGIN
  SELECT company_id, branch_id, status, COALESCE(delivery_fee,0), COALESCE(discount_value,0)
    INTO v_company, v_branch, v_status, v_delivery, v_disc
    FROM erp_laundry_orders WHERE id = p_order_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود.'; END IF;
  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF v_status = 'delivered' THEN RAISE EXCEPTION 'تم تسليم الطلب بالفعل.'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'الطلب ملغي.'; END IF;

  SELECT COALESCE(SUM(qty * price), 0) INTO v_sub FROM erp_laundry_order_items WHERE order_id = p_order_id;
  v_total := GREATEST(v_sub - LEAST(v_disc, v_sub) + v_delivery, 0);

  UPDATE erp_laundry_orders SET status='delivered', total=v_total, payment_method=v_method, delivered_at=now() WHERE id=p_order_id;

  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM erp_branches WHERE company_id = v_company AND is_active ORDER BY code LIMIT 1;
  END IF;
  IF v_branch IS NOT NULL AND v_total > 0 THEN
    SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = CASE WHEN v_method='card' THEN '1120' ELSE '1100' END AND is_system LIMIT 1;
    SELECT id INTO v_rev FROM erp_chart_of_accounts WHERE code = '4200' AND is_system LIMIT 1;
    IF v_cash IS NOT NULL AND v_rev IS NOT NULL THEN
      INSERT INTO erp_journal_entries
        (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_branch,'journal'), CURRENT_DATE, 'مبيعات مغسلة', 'laundry_order', p_order_id, v_branch, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
        (v_entry, v_cash, v_total, 0), (v_entry, v_rev, 0, v_total);
    END IF;
  END IF;
  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION erp_close_laundry_order(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_close_laundry_order(UUID, TEXT) TO authenticated;

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','laundry.manage'),('manager','laundry.manage'),('cashier','laundry.manage')
ON CONFLICT DO NOTHING;
INSERT INTO erp_business_type_modules (business_type, module) VALUES ('laundry','laundry')
ON CONFLICT (business_type, module) DO NOTHING;
INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'laundry' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'laundry', true FROM erp_companies WHERE business_type='laundry'
ON CONFLICT (company_id, module) DO NOTHING;
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'laundry.manage'
FROM erp_company_roles cr JOIN erp_companies c ON c.id=cr.company_id
WHERE c.business_type='laundry' AND cr.enabled AND cr.role_key IN ('admin','manager','cashier')
ON CONFLICT DO NOTHING;
