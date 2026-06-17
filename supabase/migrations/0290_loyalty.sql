-- ============================================================================
-- 0290 — Pharmacy loyalty (points earn + redeem). Partial payment & customer
-- credit reuse the existing AR layer (erp_customers.balance / credit_limit /
-- credit_control_enabled + partial recordPayment), so no schema is needed there.
-- ----------------------------------------------------------------------------
--   • erp_customers.loyalty_points — running points balance.
--   • erp_loyalty_settings(company) — earn_rate (points per 1 EGP), redeem_rate
--     (EGP value per point), min_redeem (floor before redemption is allowed).
--   • erp_loyalty_ledger — every earn/redeem, linked to the invoice.
--   • erp_loyalty_redeem_earn(...) — atomic: validates the redeem against the
--     balance, applies redeem then earn, writes the ledger. Tenant-scoped.
-- Safe to re-run.
-- ============================================================================
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS loyalty_points numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS erp_loyalty_settings (
  company_id uuid PRIMARY KEY REFERENCES erp_companies(id) ON DELETE CASCADE,
  earn_rate numeric NOT NULL DEFAULT 0,     -- points earned per 1 EGP spent
  redeem_rate numeric NOT NULL DEFAULT 0,   -- EGP value of 1 point on redemption
  min_redeem numeric NOT NULL DEFAULT 0,    -- minimum points before redeeming
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS erp_loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  invoice_no text,
  points numeric NOT NULL,               -- +earn / -redeem
  kind text NOT NULL CHECK (kind IN ('earn','redeem')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON erp_loyalty_ledger (company_id, customer_id, created_at DESC);

ALTER TABLE erp_loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_loyalty_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_loyalty_settings_tenant ON erp_loyalty_settings;
CREATE POLICY erp_loyalty_settings_tenant ON erp_loyalty_settings
  FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS erp_loyalty_ledger_tenant ON erp_loyalty_ledger;
CREATE POLICY erp_loyalty_ledger_tenant ON erp_loyalty_ledger
  FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP TRIGGER IF EXISTS erp_loyalty_ledger_set_company ON erp_loyalty_ledger;
CREATE TRIGGER erp_loyalty_ledger_set_company BEFORE INSERT ON erp_loyalty_ledger
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

-- Atomic redeem-then-earn for one sale. Redeem is validated against the live
-- balance (and the min-redeem floor); both legs hit the ledger. Returns the new
-- points balance.
CREATE OR REPLACE FUNCTION erp_loyalty_redeem_earn(
  p_customer uuid, p_invoice_no text, p_redeem numeric, p_earn numeric
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid := erp_user_company_id(); v_bal numeric; v_min numeric;
BEGIN
  SELECT loyalty_points INTO v_bal FROM erp_customers WHERE id = p_customer AND company_id = v_co FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  SELECT COALESCE(min_redeem,0) INTO v_min FROM erp_loyalty_settings WHERE company_id = v_co;
  IF COALESCE(p_redeem,0) > 0 THEN
    IF p_redeem > v_bal THEN RAISE EXCEPTION 'insufficient_points'; END IF;
    IF v_bal < COALESCE(v_min,0) THEN RAISE EXCEPTION 'below_min_redeem'; END IF;
    INSERT INTO erp_loyalty_ledger (company_id, customer_id, invoice_no, points, kind)
      VALUES (v_co, p_customer, p_invoice_no, -p_redeem, 'redeem');
    v_bal := v_bal - p_redeem;
  END IF;
  IF COALESCE(p_earn,0) > 0 THEN
    INSERT INTO erp_loyalty_ledger (company_id, customer_id, invoice_no, points, kind)
      VALUES (v_co, p_customer, p_invoice_no, p_earn, 'earn');
    v_bal := v_bal + p_earn;
  END IF;
  UPDATE erp_customers SET loyalty_points = v_bal WHERE id = p_customer AND company_id = v_co;
  RETURN v_bal;
END $$;
GRANT EXECUTE ON FUNCTION erp_loyalty_redeem_earn(uuid, text, numeric, numeric) TO authenticated, service_role;
