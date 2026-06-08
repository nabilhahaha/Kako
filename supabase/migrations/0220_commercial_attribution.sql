-- ============================================================================
-- 0220: Commercial Attribution & Traceability ledger (Phase 4+)
-- ----------------------------------------------------------------------------
-- The raw attribution ledger linking any commercial document (invoice / invoice
-- line / return / promotion) to its promotion, funding shares, incentive, and
-- commission — plus owner dimensions — so the platform can EXPLAIN every
-- transaction and expose fully traceable raw data (Excel/CSV/Power BI/API).
-- Additive + INERT until KAKO_ATTRIBUTION is on. Company-scoped RLS. Depends on
-- 0005, 0018, 0062, 0195, 0218.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_commercial_attribution (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  ref_type            text NOT NULL CHECK (ref_type IN ('invoice','invoice_line','return','promotion')),
  ref_id              uuid NOT NULL,
  promotion_id        uuid REFERENCES erp_trade_promotions(id) ON DELETE SET NULL,
  promotion_name      text,
  promotion_type      text,
  funding_source      text,
  supplier_share      numeric(14,2),
  company_share       numeric(14,2),
  distributor_share   numeric(14,2),
  discount_amount     numeric(14,2),
  free_goods_qty      numeric(14,3),
  incentive_program_id uuid REFERENCES erp_incentive_programs(id) ON DELETE SET NULL,
  incentive_amount    numeric(14,2),
  commission_rule_id  uuid REFERENCES erp_commission_rules(id) ON DELETE SET NULL,
  commission_amount   numeric(14,2),
  gross_sales         numeric(14,2),
  net_sales           numeric(14,2),
  return_impact_value numeric(14,2),
  roi_impact          numeric(14,2),
  customer_id         uuid REFERENCES erp_customers(id) ON DELETE SET NULL,
  salesman_id         uuid,
  supervisor_id       uuid,
  route_id            uuid REFERENCES erp_routes(id) ON DELETE SET NULL,
  channel             text,
  region_id           uuid,
  period              text,
  event_date          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- FK-covering (first index col = FK col) + lookup indexes.
CREATE INDEX IF NOT EXISTS idx_attribution_company   ON erp_commercial_attribution (company_id, period);
CREATE INDEX IF NOT EXISTS idx_attribution_promotion ON erp_commercial_attribution (promotion_id);
CREATE INDEX IF NOT EXISTS idx_attribution_program   ON erp_commercial_attribution (incentive_program_id);
CREATE INDEX IF NOT EXISTS idx_attribution_rule      ON erp_commercial_attribution (commission_rule_id);
CREATE INDEX IF NOT EXISTS idx_attribution_customer  ON erp_commercial_attribution (customer_id);
CREATE INDEX IF NOT EXISTS idx_attribution_route     ON erp_commercial_attribution (route_id);
CREATE INDEX IF NOT EXISTS idx_attribution_ref       ON erp_commercial_attribution (ref_type, ref_id);

ALTER TABLE erp_commercial_attribution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_commercial_attribution_tenant ON erp_commercial_attribution;
CREATE POLICY erp_commercial_attribution_tenant ON erp_commercial_attribution FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
