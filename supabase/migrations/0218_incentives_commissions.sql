-- ============================================================================
-- 0218: Enterprise Promotion Platform — incentives, commissions, requests (Phase 4+)
-- ----------------------------------------------------------------------------
-- UNLIMITED incentive layers (per-role rewards on a program), a configurable
-- commission rule engine (fixed/percentage/tiered/achievement, scoped by SKU/
-- brand/category/customer/channel/route/region/salesman), and salesman-raised
-- promotion requests (routed through Workflow OS). Additive + INERT until
-- KAKO_PROMOTIONS is on. Company-scoped RLS. Depends on 0005, 0018, 0195.
-- ============================================================================

-- Incentive programs + unlimited layers.
CREATE TABLE IF NOT EXISTS erp_incentive_programs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  promotion_id  uuid REFERENCES erp_trade_promotions(id) ON DELETE SET NULL,
  name          text NOT NULL,
  period        text,
  target_metric text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incentive_programs_company   ON erp_incentive_programs (company_id);
CREATE INDEX IF NOT EXISTS idx_incentive_programs_promotion ON erp_incentive_programs (promotion_id);
ALTER TABLE erp_incentive_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_incentive_programs_tenant ON erp_incentive_programs;
CREATE POLICY erp_incentive_programs_tenant ON erp_incentive_programs FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

CREATE TABLE IF NOT EXISTS erp_incentive_layers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  program_id         uuid NOT NULL REFERENCES erp_incentive_programs(id) ON DELETE CASCADE,
  role               text NOT NULL,
  amount             numeric(14,2) NOT NULL DEFAULT 0,
  achievement_scaled boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incentive_layers_company ON erp_incentive_layers (company_id);
CREATE INDEX IF NOT EXISTS idx_incentive_layers_program ON erp_incentive_layers (program_id);
ALTER TABLE erp_incentive_layers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_incentive_layers_tenant ON erp_incentive_layers;
CREATE POLICY erp_incentive_layers_tenant ON erp_incentive_layers FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Commission rules (scoped, configurable).
CREATE TABLE IF NOT EXISTS erp_commission_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('fixed','percentage','tiered','achievement')),
  amount          numeric(14,2),
  percent         numeric(7,4),
  tiers           jsonb,
  scope_dimension text,    -- sku|brand|category|customer|channel|route|region|salesman
  scope_ref_id    uuid,
  salesman_id     uuid,
  effective_from  date,
  effective_to    date,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_rules_company ON erp_commission_rules (company_id, is_active);
ALTER TABLE erp_commission_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_commission_rules_tenant ON erp_commission_rules;
CREATE POLICY erp_commission_rules_tenant ON erp_commission_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Salesman-raised promotion requests (approval routed via Workflow OS).
CREATE TABLE IF NOT EXISTS erp_promotion_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES erp_customers(id) ON DELETE SET NULL,
  requested_by     uuid,
  promo_type       text,
  start_date       date,
  end_date         date,
  target_skus      jsonb,
  requested_budget numeric(14,2),
  expected_sales   numeric(14,2),
  expected_volume  numeric(14,2),
  justification    text,
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','submitted','approved','rejected')),
  current_stage    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotion_requests_company  ON erp_promotion_requests (company_id, status);
CREATE INDEX IF NOT EXISTS idx_promotion_requests_customer ON erp_promotion_requests (customer_id);
ALTER TABLE erp_promotion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_promotion_requests_tenant ON erp_promotion_requests;
CREATE POLICY erp_promotion_requests_tenant ON erp_promotion_requests FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
