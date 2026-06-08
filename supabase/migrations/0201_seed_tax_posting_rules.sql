-- ============================================================================
-- 0201: Global Tax — seed posting rules (Phase 5A · M5 GL integration)
-- ----------------------------------------------------------------------------
-- Reuses the Phase-1 posting engine (Augment model): tax posts under its OWN
-- reference types, zero overlap with sales/AR/COGS/AP.
--   * tax.output     → Dr AR / Cr Output VAT        (ref 'tax_output')
--   * tax.input      → Dr Input VAT / Cr AP         (ref 'tax_input')
--   * tax.adjustment → Dr Output VAT / Cr AR        (ref 'tax_adjustment'; sales CN tax reversal)
-- Amount = context.amounts.total (the VAT engine's tax). Account keys resolve per
-- company via erp_account_map; the poster SKIPS the whole entry if a key is
-- unmapped (never partial). Idempotent (NOT EXISTS). Additive + INERT until
-- KAKO_FINANCE is on AND the tax GL orchestrator runs. Depends on 0186.
-- ============================================================================

DO $$
DECLARE v_rule_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM erp_posting_rules WHERE source_event='tax.output' AND company_id IS NULL AND name='Output VAT') THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'tax.output', 'Output VAT', 100, true) RETURNING id INTO v_rule_id;
    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'ar',         'total', 0),
      (v_rule_id, NULL, 'credit', 'output_vat', 'total', 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM erp_posting_rules WHERE source_event='tax.input' AND company_id IS NULL AND name='Input VAT') THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'tax.input', 'Input VAT', 100, true) RETURNING id INTO v_rule_id;
    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'input_vat', 'total', 0),
      (v_rule_id, NULL, 'credit', 'ap',        'total', 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM erp_posting_rules WHERE source_event='tax.adjustment' AND company_id IS NULL AND name='VAT adjustment (sales note)') THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'tax.adjustment', 'VAT adjustment (sales note)', 100, true) RETURNING id INTO v_rule_id;
    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'output_vat', 'total', 0),
      (v_rule_id, NULL, 'credit', 'ar',         'total', 1);
  END IF;
END $$;
