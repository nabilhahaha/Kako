-- ============================================================================
-- 0223: Commercial Excellence — customer profitability snapshot (Phase 7)
-- ----------------------------------------------------------------------------
-- Per-customer, per-period profitability snapshot (revenue + full cost stack →
-- GP / net profit / margins / ROI / cost-to-serve). Computed by the pure
-- profitability engine from invoices + attribution + trade spend. INERT until
-- KAKO_COMMERCIAL is on. Company-scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_customer_profitability (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id     uuid NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  period          text NOT NULL,                 -- 'YYYY-MM'
  gross_sales     numeric(16,2) NOT NULL DEFAULT 0,
  net_sales       numeric(16,2) NOT NULL DEFAULT 0,
  cogs            numeric(16,2) NOT NULL DEFAULT 0,
  cost_to_serve   numeric(16,2) NOT NULL DEFAULT 0,
  gross_profit    numeric(16,2) NOT NULL DEFAULT 0,
  net_profit      numeric(16,2) NOT NULL DEFAULT 0,
  gp_pct          numeric(7,2),
  net_profit_pct  numeric(7,2),
  roi             numeric(10,4),
  cost_breakdown  jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, customer_id, period)
);
CREATE INDEX IF NOT EXISTS idx_customer_profit_company  ON erp_customer_profitability (company_id, period);
CREATE INDEX IF NOT EXISTS idx_customer_profit_customer ON erp_customer_profitability (customer_id);
ALTER TABLE erp_customer_profitability ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_customer_profit_tenant ON erp_customer_profitability;
CREATE POLICY erp_customer_profit_tenant ON erp_customer_profitability FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
