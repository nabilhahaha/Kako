-- ============================================================================
-- 0054: Restaurant / café module (tables, orders, kitchen, checkout)
-- ----------------------------------------------------------------------------
-- A food-service vertical for restaurants & cafés: a floor of tables, orders
-- (dine-in / takeaway / delivery) built from the existing product catalogue
-- (the menu), a kitchen status per line, and checkout that frees the table and
-- posts revenue to the journal. Tenant-scoped (RLS + company_id trigger). Adds
-- a 'restaurant' module + 'restaurant.manage' permission. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_restaurant_tables (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id  UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  seats      INTEGER NOT NULL DEFAULT 4,
  status     TEXT NOT NULL DEFAULT 'free',   -- free | occupied
  sort       INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_restaurant_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id        UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  table_id         UUID REFERENCES erp_restaurant_tables(id) ON DELETE SET NULL,
  order_type       TEXT NOT NULL DEFAULT 'dine_in',  -- dine_in | takeaway | delivery
  status           TEXT NOT NULL DEFAULT 'open',     -- open | ready | closed | cancelled
  customer_name    TEXT,
  customer_phone   TEXT,
  customer_address TEXT,
  delivery_fee     NUMERIC NOT NULL DEFAULT 0,
  total            NUMERIC NOT NULL DEFAULT 0,
  notes            TEXT,
  created_by       UUID,
  closed_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_restaurant_order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  order_id       UUID NOT NULL REFERENCES erp_restaurant_orders(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  qty            NUMERIC NOT NULL DEFAULT 1,
  price          NUMERIC NOT NULL DEFAULT 0,
  notes          TEXT,
  kitchen_status TEXT NOT NULL DEFAULT 'new',  -- new | preparing | ready
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_rest_tables_company ON erp_restaurant_tables(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_rest_orders_company ON erp_restaurant_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_rest_orders_status ON erp_restaurant_orders(status);
CREATE INDEX IF NOT EXISTS idx_erp_rest_items_order ON erp_restaurant_order_items(order_id);

ALTER TABLE erp_restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_restaurant_order_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_restaurant_tables','erp_restaurant_orders','erp_restaurant_order_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;

-- Checkout: total the items (+ delivery), close the order, free the table, and
-- post Debit Cash (1100) / Credit Sales Revenue (4100) to the journal.
CREATE OR REPLACE FUNCTION erp_close_restaurant_order(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID; v_branch UUID; v_table UUID; v_status TEXT; v_delivery NUMERIC;
  v_total NUMERIC; v_cash UUID; v_rev UUID; v_entry UUID; v_uid UUID := auth.uid();
BEGIN
  SELECT company_id, branch_id, table_id, status, COALESCE(delivery_fee,0)
    INTO v_company, v_branch, v_table, v_status, v_delivery
    FROM erp_restaurant_orders WHERE id = p_order_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'الأوردر غير موجود.'; END IF;
  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'تم إغلاق الأوردر بالفعل.'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'الأوردر ملغي.'; END IF;

  SELECT COALESCE(SUM(qty * price), 0) + v_delivery INTO v_total
    FROM erp_restaurant_order_items WHERE order_id = p_order_id;

  UPDATE erp_restaurant_orders
     SET status = 'closed', total = v_total, closed_at = now()
   WHERE id = p_order_id;

  IF v_table IS NOT NULL THEN
    UPDATE erp_restaurant_tables SET status = 'free' WHERE id = v_table;
  END IF;

  -- post revenue (skip silently if the chart isn't set up)
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM erp_branches WHERE company_id = v_company AND is_active ORDER BY code LIMIT 1;
  END IF;
  IF v_branch IS NOT NULL AND v_total > 0 THEN
    SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = '1100' AND is_system LIMIT 1;
    SELECT id INTO v_rev  FROM erp_chart_of_accounts WHERE code = '4100' AND is_system LIMIT 1;
    IF v_cash IS NOT NULL AND v_rev IS NOT NULL THEN
      INSERT INTO erp_journal_entries
        (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES
        (erp_next_number(v_branch, 'journal'), CURRENT_DATE, 'مبيعات مطعم/كافيه',
         'restaurant_order', p_order_id, v_branch, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
        (v_entry, v_cash, v_total, 0),
        (v_entry, v_rev, 0, v_total);
    END IF;
  END IF;

  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION erp_close_restaurant_order(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_close_restaurant_order(UUID) TO authenticated;

-- Permission, module, plan + business-type wiring (mirrors the clinic module).
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','restaurant.manage'),('manager','restaurant.manage'),('cashier','restaurant.manage')
ON CONFLICT DO NOTHING;

INSERT INTO erp_business_type_modules (business_type, module) VALUES
  ('restaurant','restaurant'),('cafe','restaurant')
ON CONFLICT (business_type, module) DO NOTHING;

INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'restaurant' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;

INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'restaurant', true FROM erp_companies WHERE business_type IN ('restaurant','cafe')
ON CONFLICT (company_id, module) DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'restaurant.manage'
FROM erp_company_roles cr JOIN erp_companies c ON c.id = cr.company_id
WHERE c.business_type IN ('restaurant','cafe') AND cr.enabled
  AND cr.role_key IN ('admin','manager','cashier')
ON CONFLICT DO NOTHING;
