-- ============================================================================
-- 0196: Trade Spend — seed posting rules (Phase 4 GL integration)
-- ----------------------------------------------------------------------------
-- Reuses the Phase-1 posting engine (Augment model): trade-spend posts under its
-- OWN reference types, so there is zero overlap with sales/AR/COGS posting.
--   * trade.accrual → Dr promo_expense / Cr accrued_trade_spend  (ref 'trade_accrual')
--   * trade.claim   → Dr accrued_trade_spend / Cr ar             (ref 'trade_claim')
-- Net: a promo accrues an expense + liability; a settled claim/deduction clears the
-- liability against the customer receivable. Amounts come from context.amounts.total
-- (the accrual/claim engine output). Account keys resolve per company via
-- erp_account_map; the poster SKIPS the whole entry if a key is unmapped (never
-- partial). Idempotent (guarded by NOT EXISTS). Additive + INERT: nothing posts
-- until KAKO_FINANCE is on AND the trade-spend GL orchestrator runs.
-- Depends on 0186 (erp_posting_rules/_lines).
-- ============================================================================

DO $$
DECLARE v_rule_id uuid;
BEGIN
  -- ── trade.accrual → Dr promo_expense / Cr accrued_trade_spend ──────────────
  IF NOT EXISTS (
    SELECT 1 FROM erp_posting_rules
    WHERE source_event = 'trade.accrual' AND company_id IS NULL AND name = 'Trade spend accrual'
  ) THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'trade.accrual', 'Trade spend accrual', 100, true)
    RETURNING id INTO v_rule_id;

    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'promo_expense',        'total', 0),
      (v_rule_id, NULL, 'credit', 'accrued_trade_spend',  'total', 1);
  END IF;

  -- ── trade.claim → Dr accrued_trade_spend / Cr ar ──────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM erp_posting_rules
    WHERE source_event = 'trade.claim' AND company_id IS NULL AND name = 'Trade spend claim settlement'
  ) THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'trade.claim', 'Trade spend claim settlement', 100, true)
    RETURNING id INTO v_rule_id;

    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'accrued_trade_spend', 'total', 0),
      (v_rule_id, NULL, 'credit', 'ar',                  'total', 1);
  END IF;
END $$;
