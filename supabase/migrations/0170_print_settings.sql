-- ============================================================================
-- 0170: Retail printer / receipt preferences (store-owner friendly)
-- ----------------------------------------------------------------------------
-- Extends the per-company erp_ops_settings (already RLS-scoped, created in 0163)
-- with simple receipt/print preferences the store owner controls. ADDITIVE,
-- idempotent, no new table, no new FK. Consumed by the invoice/receipt print
-- templates.
-- ============================================================================

ALTER TABLE erp_ops_settings
  ADD COLUMN IF NOT EXISTS receipt_paper    TEXT    NOT NULL DEFAULT '80mm',
  ADD COLUMN IF NOT EXISTS receipt_header   TEXT,
  ADD COLUMN IF NOT EXISTS receipt_footer   TEXT,
  ADD COLUMN IF NOT EXISTS show_logo        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_tax_number  BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_ops_settings_receipt_paper_chk') THEN
    ALTER TABLE erp_ops_settings
      ADD CONSTRAINT erp_ops_settings_receipt_paper_chk CHECK (receipt_paper IN ('80mm','58mm','A4'));
  END IF;
END $$;
