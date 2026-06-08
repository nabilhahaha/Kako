-- ============================================================================
-- 0224: Commercial Excellence — demand forecasts (Phase 7, 6B)
-- ----------------------------------------------------------------------------
-- Multi-type demand forecasts (sales/customer/route/SKU/brand) with the driver
-- used + actuals for accuracy tracking. Computed by the pure forecasting engine.
-- Sales targets reuse erp_targets (0139). INERT until KAKO_COMMERCIAL is on.
-- Company-scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_forecasts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  forecast_type    text NOT NULL CHECK (forecast_type IN ('sales','customer','route','sku','brand')),
  dimension_ref_id uuid,                     -- the customer/route/sku/... forecasted
  period           text NOT NULL,            -- 'YYYY-MM'
  driver           text,                     -- historical|seasonality|promotion_uplift|new_listings|distribution_growth|market_expansion
  forecast_qty     numeric(16,3),
  forecast_value   numeric(16,2),
  actual_qty       numeric(16,3),
  actual_value     numeric(16,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forecasts_company ON erp_forecasts (company_id, forecast_type, period);
ALTER TABLE erp_forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_forecasts_tenant ON erp_forecasts;
CREATE POLICY erp_forecasts_tenant ON erp_forecasts FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
