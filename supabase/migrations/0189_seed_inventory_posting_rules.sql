-- ============================================================================
-- 0189: Finance Foundation — seed posting rules for the inventory AUGMENT legs
-- ----------------------------------------------------------------------------
-- Decision D-003 (owner-approved "Augment"): the event-driven engine posts ONLY
-- the legs the legacy triggers omit, under DISTINCT reference types, so there is
-- zero double-post with the existing AR/Revenue/payment/return posting.
--
-- Two global default rules (company_id NULL; per-company rows may override later):
--   * goods.received → Dr Inventory / Cr GR-IR   (receipt valued at cost)
--   * invoice.cogs   → Dr COGS / Cr Inventory     (sale → cost of goods sold)
-- Amounts come from context.amounts (the costing service's total_cost): key
-- 'inventory' for the receipt, 'cogs' for the sale. Account keys resolve per
-- company via erp_account_map → COA; if a company hasn't mapped a key the poster
-- safely SKIPS the whole entry (never a partial post).
--
-- Additive + INERT: rules are data; nothing emits these events or invokes the
-- poster unless KAKO_FINANCE is on AND the GL orchestrator runs. No behaviour
-- change at OFF. Idempotent (guarded by NOT EXISTS on the global rule name).
-- Depends on 0186 (erp_posting_rules/_lines).
-- ============================================================================

DO $$
DECLARE
  v_rule_id uuid;
BEGIN
  -- ── goods.received → Dr Inventory / Cr GR-IR ──────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM erp_posting_rules
    WHERE source_event = 'goods.received' AND company_id IS NULL AND name = 'Goods receipt — inventory at cost'
  ) THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'goods.received', 'Goods receipt — inventory at cost', 100, true)
    RETURNING id INTO v_rule_id;

    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'inventory', 'inventory', 0),
      (v_rule_id, NULL, 'credit', 'gr_ir',     'inventory', 1);
  END IF;

  -- ── invoice.cogs → Dr COGS / Cr Inventory ─────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM erp_posting_rules
    WHERE source_event = 'invoice.cogs' AND company_id IS NULL AND name = 'Sale — cost of goods sold'
  ) THEN
    INSERT INTO erp_posting_rules (company_id, source_event, name, priority, is_active)
    VALUES (NULL, 'invoice.cogs', 'Sale — cost of goods sold', 100, true)
    RETURNING id INTO v_rule_id;

    -- No cost-center dimension yet: erp_journal_lines.cost_center_id FKs to the
    -- cost-centers table, and a branch→cost-center mapping is out of Phase-1 scope.
    -- The entry is balanced and correct without it; cost-center analytics is a
    -- later enhancement (a per-company rule override can add it).
    INSERT INTO erp_posting_rule_lines (rule_id, company_id, side, account_key, amount_source, sort_order) VALUES
      (v_rule_id, NULL, 'debit',  'cogs',      'cogs', 0),
      (v_rule_id, NULL, 'credit', 'inventory', 'cogs', 1);
  END IF;
END $$;
