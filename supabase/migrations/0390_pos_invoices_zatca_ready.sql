-- ============================================================================
-- 0390 — Fast Food POS: ZATCA-READY invoice ledger (ADDITIVE, idempotent).
--
-- A companion ledger that snapshots each completed POS sale as a structured, regenerate-able
-- invoice — enough to print a ZATCA-style simplified tax invoice, build the Phase-1 QR, and
-- generate UBL XML later WITHOUT rebuilding the sale engine. It REFERENCES the existing
-- restaurant order (the operational sale) and does NOT modify erp_restaurant_orders / items.
--
-- This is FOUNDATIONS ONLY — it is NOT full ZATCA Phase-2 compliance: cryptographic signing,
-- hash chaining, and live ZATCA reporting/clearance are deferred (placeholder columns below)
-- and must be integrated + officially tested before any compliance claim.
--
-- Safety: additive (CREATE IF NOT EXISTS / new RPCs), no DROP/DELETE of business data, RLS
-- company-scoped, issued invoices are IMMUTABLE from the client (no UPDATE/DELETE policy —
-- voids/refunds go through a permission-checked SECURITY DEFINER RPC that creates a separate
-- credit-note reversal and never deletes the original). Field Verification / Route Planner /
-- Multi-Form untouched.
-- ============================================================================

-- 1) Per-company / per-year sequential counter (touched only via the RPC; RLS-locked) --------
CREATE TABLE IF NOT EXISTS erp_pos_invoice_counters (
  company_id uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  last_no    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year)
);
ALTER TABLE erp_pos_invoice_counters ENABLE ROW LEVEL SECURITY;

-- 2) The POS invoice ledger -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_pos_invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id       uuid,
  order_id        uuid REFERENCES erp_restaurant_orders(id) ON DELETE SET NULL,  -- source sale
  invoice_number  text NOT NULL,                       -- sequential per company
  invoice_uuid    uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_type    text NOT NULL DEFAULT 'simplified_tax_invoice',  -- simplified_tax_invoice | tax_invoice
  doc_type        text NOT NULL DEFAULT 'invoice',     -- invoice | credit_note
  reverses_id     uuid REFERENCES erp_pos_invoices(id) ON DELETE SET NULL,  -- credit note → original
  issue_at        timestamptz NOT NULL DEFAULT now(),
  -- snapshot (so the invoice can be regenerated without the live UI / catalog)
  seller_name     text,
  seller_vat      text,
  customer_name   text,
  customer_vat    text,
  customer_phone  text,
  order_type      text,                                -- dine_in | takeaway | delivery
  payment_method  text,                                -- cash | card | mixed
  subtotal        numeric(14,2) NOT NULL DEFAULT 0,
  discount_total  numeric(14,2) NOT NULL DEFAULT 0,
  service_total   numeric(14,2) NOT NULL DEFAULT 0,
  tax_total       numeric(14,2) NOT NULL DEFAULT 0,
  grand_total     numeric(14,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'issued',      -- issued | voided | refunded
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- full structured invoice incl. lines
  -- ── ZATCA Phase-2 placeholders (additive, populated later by the signing/reporting layer) ──
  zatca_status      text NOT NULL DEFAULT 'not_reported',  -- not_reported | reported | cleared | failed
  zatca_uuid        uuid,
  zatca_hash        text,
  zatca_qr          text,                              -- Phase-1 TLV/Base64 QR (stored at issue)
  zatca_xml         text,                              -- UBL XML (or storage path) — prepared later
  zatca_reported_at timestamptz,
  zatca_cleared_at  timestamptz,
  void_reason     text,
  created_by      uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_number)
);
ALTER TABLE erp_pos_invoices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pos_inv_company_issue ON erp_pos_invoices (company_id, issue_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_inv_order   ON erp_pos_invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_pos_inv_reverses ON erp_pos_invoices (reverses_id);
CREATE INDEX IF NOT EXISTS idx_pos_inv_created_by ON erp_pos_invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_pos_inv_status ON erp_pos_invoices (company_id, status);

-- 3) RLS — company-scoped READ + INSERT; NO update/delete policy (issued invoices immutable).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='erp_pos_invoices' AND policyname='pos_inv_sel') THEN
    CREATE POLICY pos_inv_sel ON erp_pos_invoices FOR SELECT
      USING (erp_is_platform_owner() OR company_id = erp_user_company_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='erp_pos_invoices' AND policyname='pos_inv_ins') THEN
    CREATE POLICY pos_inv_ins ON erp_pos_invoices FOR INSERT
      WITH CHECK (company_id = erp_user_company_id());
  END IF;
END $$;

-- 4) Atomic per-company sequential invoice number: INV-YYYY-###### ----------------------------
CREATE OR REPLACE FUNCTION erp_pos_next_invoice_no(p_company uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_year int := EXTRACT(YEAR FROM now())::int; v_no int;
BEGIN
  IF p_company IS NULL OR p_company <> erp_user_company_id() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO erp_pos_invoice_counters (company_id, year, last_no)
  VALUES (p_company, v_year, 1)
  ON CONFLICT (company_id, year) DO UPDATE SET last_no = erp_pos_invoice_counters.last_no + 1
  RETURNING last_no INTO v_no;
  RETURN 'INV-' || v_year::text || '-' || lpad(v_no::text, 6, '0');
END $$;

-- 5) Void / refund as a CREDIT NOTE reversal (permission-checked; never deletes) --------------
CREATE OR REPLACE FUNCTION erp_pos_void_invoice(p_invoice_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid := erp_user_company_id(); o erp_pos_invoices%ROWTYPE; v_new uuid; v_no text;
BEGIN
  SELECT * INTO o FROM erp_pos_invoices WHERE id = p_invoice_id;
  IF NOT FOUND OR o.company_id <> v_company THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (erp_is_company_admin(v_company) OR erp_user_has_permission(v_company, 'restaurant.manage')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF o.doc_type <> 'invoice' OR o.status <> 'issued' THEN RAISE EXCEPTION 'cannot void'; END IF;

  v_no := erp_pos_next_invoice_no(v_company);
  INSERT INTO erp_pos_invoices (
    company_id, branch_id, order_id, invoice_number, invoice_type, doc_type, reverses_id,
    seller_name, seller_vat, customer_name, customer_vat, customer_phone, order_type, payment_method,
    subtotal, discount_total, service_total, tax_total, grand_total, status, payload, zatca_qr,
    void_reason, created_by
  ) VALUES (
    o.company_id, o.branch_id, o.order_id, v_no, o.invoice_type, 'credit_note', o.id,
    o.seller_name, o.seller_vat, o.customer_name, o.customer_vat, o.customer_phone, o.order_type, o.payment_method,
    -o.subtotal, -o.discount_total, -o.service_total, -o.tax_total, -o.grand_total, 'issued', o.payload, o.zatca_qr,
    p_reason, auth.uid()
  ) RETURNING id INTO v_new;

  UPDATE erp_pos_invoices SET status = 'voided', void_reason = p_reason WHERE id = o.id;
  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION erp_pos_next_invoice_no(uuid) FROM public;
GRANT EXECUTE ON FUNCTION erp_pos_next_invoice_no(uuid) TO authenticated;
REVOKE ALL ON FUNCTION erp_pos_void_invoice(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION erp_pos_void_invoice(uuid, text) TO authenticated;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_pos_void_invoice(uuid,text);
-- DROP FUNCTION IF EXISTS erp_pos_next_invoice_no(uuid);
-- DROP TABLE IF EXISTS erp_pos_invoices;
-- DROP TABLE IF EXISTS erp_pos_invoice_counters;
