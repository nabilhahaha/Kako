-- ============================================================================
-- 0191: Purchasing Foundation — AP sub-ledger + supplier-invoice posting rule
-- ----------------------------------------------------------------------------
-- The accounts-payable sub-ledger: a per-supplier transaction log (bill / payment
-- / return / adjustment) that backs AP aging — richer than the single
-- erp_suppliers.balance summary. Plus the Augment posting rule that moves the
-- goods-receipt clearing to AP when a supplier invoice is approved:
--   supplier.invoice → Dr GR-IR / Cr AP   (reference_type 'supplier_invoice')
-- Net of the Phase-1 receipt leg (Dr Inventory / Cr GR-IR) this yields the correct
-- Inventory Dr / AP Cr, with GR-IR clearing between receipt and bill.
--
-- Additive + INERT: nothing writes the ledger or posts until KAKO_PURCHASING /
-- KAKO_FINANCE are on. Company-scoped RLS (suppliers are company-scoped).
-- Depends on 0005 (erp_companies/_suppliers), 0186 (erp_posting_rules/_lines).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_ap_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  supplier_id  uuid NOT NULL REFERENCES erp_suppliers(id) ON DELETE CASCADE,
  doc_type     text NOT NULL CHECK (doc_type IN ('bill','payment','return','adjustment')),
  doc_id       uuid,                                  -- source document (bill/payment/return)
  doc_date     date NOT NULL DEFAULT CURRENT_DATE,
  due_date     date,
  -- signed: positive increases payable (bill), negative decreases (payment/return)
  amount       numeric(14,2) NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- FK-covering + aging-lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_ap_ledger_company  ON erp_ap_ledger (company_id);
CREATE INDEX IF NOT EXISTS idx_ap_ledger_supplier ON erp_ap_ledger (supplier_id, doc_date);

ALTER TABLE erp_ap_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_ap_ledger_tenant ON erp_ap_ledger;
CREATE POLICY erp_ap_ledger_tenant ON erp_ap_ledger FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Augment posting rule: supplier invoice → Dr GR-IR / Cr AP ────────────────
DO $$
DECLARE v_rule_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM erp_posting_rules
    WHERE source_event = 'supplier.invoice' AND company_id IS NULL AND name = 'Supplier invoice — clear GR-IR to AP'
  ) THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'supplier.invoice', 'Supplier invoice — clear GR-IR to AP', 100, true)
    RETURNING id INTO v_rule_id;

    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'gr_ir', 'total', 0),
      (v_rule_id, NULL, 'credit', 'ap',    'total', 1);
  END IF;
END $$;
