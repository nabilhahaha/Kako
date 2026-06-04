-- ============================================================================
-- 0056: Salon / barber module (services, stylists, appointments, tickets)
-- ----------------------------------------------------------------------------
-- A beauty-services vertical: a catalogue of services with prices, bookings
-- with a chosen stylist, and service tickets (the bill) that add services,
-- assign a stylist, take a discount, and check out — posting Debit Cash/Bank /
-- Credit Service Revenue (4200). Tenant-scoped (RLS + company_id trigger).
-- Adds a 'salon' module + 'salon.manage' permission. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_salon_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, price NUMERIC NOT NULL DEFAULT 0, duration_min INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_salon_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  stylist_id UUID, service_id UUID REFERENCES erp_salon_services(id) ON DELETE SET NULL,
  customer_name TEXT, customer_phone TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL, duration_min INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_salon_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES erp_salon_appointments(id) ON DELETE SET NULL,
  stylist_id UUID, customer_name TEXT, customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'open', discount_value NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0, payment_method TEXT, notes TEXT, created_by UUID, closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_salon_ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES erp_salon_tickets(id) ON DELETE CASCADE,
  service_id UUID REFERENCES erp_salon_services(id) ON DELETE SET NULL,
  name TEXT NOT NULL, price NUMERIC NOT NULL DEFAULT 0, qty NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_salon_services_company ON erp_salon_services(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_salon_appts_company ON erp_salon_appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_salon_appts_when ON erp_salon_appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_erp_salon_tickets_company ON erp_salon_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_salon_items_ticket ON erp_salon_ticket_items(ticket_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_salon_services','erp_salon_appointments','erp_salon_tickets','erp_salon_ticket_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;

-- The salon's service providers (for the stylist picker).
CREATE OR REPLACE FUNCTION erp_salon_staff()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT p.id, p.full_name, p.email
  FROM erp_profiles p
  JOIN erp_user_branches ub ON ub.user_id = p.id
  JOIN erp_branches b ON b.id = ub.branch_id
  WHERE b.company_id = erp_user_company_id()
    AND ub.role IN ('admin','manager','stylist')
  ORDER BY p.full_name;
$$;

-- Checkout: total the items − discount, close the ticket, post revenue.
CREATE OR REPLACE FUNCTION erp_close_salon_ticket(p_ticket_id UUID, p_payment_method TEXT DEFAULT 'cash')
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_company UUID; v_branch UUID; v_status TEXT; v_disc NUMERIC; v_sub NUMERIC; v_total NUMERIC;
  v_method TEXT := CASE WHEN p_payment_method = 'card' THEN 'card' ELSE 'cash' END;
  v_cash UUID; v_rev UUID; v_entry UUID; v_uid UUID := auth.uid();
BEGIN
  SELECT company_id, branch_id, status, COALESCE(discount_value,0)
    INTO v_company, v_branch, v_status, v_disc
    FROM erp_salon_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'التذكرة غير موجودة.'; END IF;
  IF NOT (erp_is_super_admin() OR v_company = erp_user_company_id()) THEN RAISE EXCEPTION 'غير مصرح.'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'تم إغلاق التذكرة بالفعل.'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'التذكرة ملغاة.'; END IF;

  SELECT COALESCE(SUM(qty * price), 0) INTO v_sub FROM erp_salon_ticket_items WHERE ticket_id = p_ticket_id;
  v_total := GREATEST(v_sub - LEAST(v_disc, v_sub), 0);

  UPDATE erp_salon_tickets SET status='closed', total=v_total, payment_method=v_method, closed_at=now() WHERE id=p_ticket_id;

  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM erp_branches WHERE company_id = v_company AND is_active ORDER BY code LIMIT 1;
  END IF;
  IF v_branch IS NOT NULL AND v_total > 0 THEN
    SELECT id INTO v_cash FROM erp_chart_of_accounts WHERE code = CASE WHEN v_method='card' THEN '1120' ELSE '1100' END AND is_system LIMIT 1;
    SELECT id INTO v_rev FROM erp_chart_of_accounts WHERE code = '4200' AND is_system LIMIT 1;
    IF v_cash IS NOT NULL AND v_rev IS NOT NULL THEN
      INSERT INTO erp_journal_entries
        (entry_number, entry_date, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_branch,'journal'), CURRENT_DATE, 'مبيعات صالون', 'salon_ticket', p_ticket_id, v_branch, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit) VALUES
        (v_entry, v_cash, v_total, 0), (v_entry, v_rev, 0, v_total);
    END IF;
  END IF;
  RETURN v_total;
END $$;

REVOKE ALL ON FUNCTION erp_salon_staff() FROM public;
REVOKE ALL ON FUNCTION erp_close_salon_ticket(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_salon_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_close_salon_ticket(UUID, TEXT) TO authenticated;

-- Permission / module / plan / business-type wiring.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','salon.manage'),('manager','salon.manage'),('stylist','salon.manage'),
  ('cashier','salon.manage'),('receptionist','salon.manage')
ON CONFLICT DO NOTHING;

INSERT INTO erp_business_type_modules (business_type, module) VALUES ('salon','salon')
ON CONFLICT (business_type, module) DO NOTHING;
INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'salon' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'salon', true FROM erp_companies WHERE business_type='salon'
ON CONFLICT (company_id, module) DO NOTHING;
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'salon.manage'
FROM erp_company_roles cr JOIN erp_companies c ON c.id=cr.company_id
WHERE c.business_type='salon' AND cr.enabled AND cr.role_key IN ('admin','manager','stylist','cashier','receptionist')
ON CONFLICT DO NOTHING;
