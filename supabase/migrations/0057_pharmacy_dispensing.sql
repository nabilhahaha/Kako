-- ============================================================================
-- 0057: Pharmacy dispensing register (دفتر صرف الروشتات / المخدرات)
-- ----------------------------------------------------------------------------
-- A regulatory dispensing log that complements POS: who dispensed which
-- medicines, to which patient, on which prescription (doctor + Rx no), flagging
-- controlled drugs. Each line captures the FEFO batch (earliest-expiry received
-- batch) for traceability. This is a RECORD layer — it does not move stock or
-- post accounting (the sale itself goes through POS). Tenant-scoped. Adds a
-- 'pharmacy' module + 'pharmacy.dispense' permission. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_pharmacy_dispenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- open | done | cancelled
  patient_name TEXT, patient_phone TEXT, doctor_name TEXT, rx_number TEXT,
  is_controlled BOOLEAN NOT NULL DEFAULT false,
  invoice_no TEXT, notes TEXT, created_by UUID,
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_pharmacy_dispense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  dispense_id UUID NOT NULL REFERENCES erp_pharmacy_dispenses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  name TEXT NOT NULL, qty NUMERIC NOT NULL DEFAULT 1, price NUMERIC NOT NULL DEFAULT 0,
  batch_number TEXT, expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_pharm_disp_company ON erp_pharmacy_dispenses(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_pharm_disp_when ON erp_pharmacy_dispenses(dispensed_at);
CREATE INDEX IF NOT EXISTS idx_erp_pharm_disp_items_disp ON erp_pharmacy_dispense_items(dispense_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_pharmacy_dispenses','erp_pharmacy_dispense_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;

-- FEFO helper: the earliest-expiry received batch for a product (company-scoped
-- via the receipt → warehouse → branch chain), so dispensing can suggest which
-- batch to take first.
CREATE OR REPLACE FUNCTION erp_product_fefo_batch(p_product_id UUID)
RETURNS TABLE (batch_number TEXT, expiry_date DATE)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT grl.batch_number, grl.expiry_date
  FROM erp_goods_receipt_lines grl
  JOIN erp_goods_receipts gr ON gr.id = grl.goods_receipt_id
  JOIN erp_warehouses w ON w.id = gr.warehouse_id
  JOIN erp_branches b ON b.id = w.branch_id
  WHERE grl.product_id = p_product_id
    AND grl.expiry_date IS NOT NULL
    AND b.company_id = erp_user_company_id()
  ORDER BY grl.expiry_date ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION erp_product_fefo_batch(UUID) FROM public;
GRANT EXECUTE ON FUNCTION erp_product_fefo_batch(UUID) TO authenticated;

-- Module / permission / plan / business-type wiring.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','pharmacy.dispense'),('manager','pharmacy.dispense'),('cashier','pharmacy.dispense')
ON CONFLICT DO NOTHING;
INSERT INTO erp_business_type_modules (business_type, module) VALUES ('pharmacy','pharmacy')
ON CONFLICT (business_type, module) DO NOTHING;
INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'pharmacy' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'pharmacy', true FROM erp_companies WHERE business_type='pharmacy'
ON CONFLICT (company_id, module) DO NOTHING;
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'pharmacy.dispense'
FROM erp_company_roles cr JOIN erp_companies c ON c.id=cr.company_id
WHERE c.business_type='pharmacy' AND cr.enabled AND cr.role_key IN ('admin','manager','cashier')
ON CONFLICT DO NOTHING;
