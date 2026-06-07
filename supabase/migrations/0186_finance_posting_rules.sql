-- ============================================================================
-- 0186: Finance Foundation — posting-rule engine (Phase 1)
-- ----------------------------------------------------------------------------
-- Formalizes the existing erp_account_map (account_key → account_code) into a
-- data-driven POSTING-RULE engine (Finance Foundation §6, approved arch #131):
--   * erp_posting_rules       — (source_event + optional condition) → a rule
--   * erp_posting_rule_lines  — debit/credit line templates; each resolves its
--                               account via account_key → erp_account_map, with
--                               amount + optional cost-center derivation.
-- "Rules are data, not code": the pure TS resolver (src/lib/finance/posting)
-- turns a rule + a source-document context into balanced journal lines; the
-- poster (next increment) writes erp_journal_entries/_lines idempotently.
-- Additive + inert: flag-gated in the app (KAKO_FINANCE, default OFF); no seed
-- data, no posting happens until a later increment wires the consumer.
-- company_id NULL = industry-neutral default rule (per-company rows override).
-- Depends on 0018 (erp_user_company_id / erp_is_platform_owner), erp_account_map.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_posting_rules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- null = global default
  source_event text NOT NULL,                                         -- e.g. 'invoice.issued','payment.received'
  name         text NOT NULL,
  condition    jsonb NOT NULL DEFAULT '{}'::jsonb,                    -- optional equality predicate vs context.attributes
  priority     integer NOT NULL DEFAULT 100,                          -- lower = evaluated first
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posting_rules_lookup
  ON erp_posting_rules (source_event, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_posting_rules_company ON erp_posting_rules (company_id);

CREATE TABLE IF NOT EXISTS erp_posting_rule_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id            uuid NOT NULL REFERENCES erp_posting_rules(id) ON DELETE CASCADE,
  company_id         uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- denormalized (mirrors parent) for RLS
  side               text NOT NULL CHECK (side IN ('debit','credit')),
  account_key        text NOT NULL,                                         -- resolved via erp_account_map → COA
  amount_source      text NOT NULL,                                         -- context.amounts key: net|tax|total|cogs|...
  cost_center_source text,                                                  -- optional context key for cost_center_id
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_posting_rule_lines_rule ON erp_posting_rule_lines (rule_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_posting_rule_lines_company ON erp_posting_rule_lines (company_id);

ALTER TABLE erp_posting_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_posting_rule_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_posting_rules_tenant ON erp_posting_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

CREATE POLICY erp_posting_rule_lines_tenant ON erp_posting_rule_lines FOR ALL
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
