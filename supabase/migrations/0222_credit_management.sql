-- ============================================================================
-- 0222: Commercial Excellence — credit management (Phase 7)
-- ----------------------------------------------------------------------------
-- Customer credit profiles (classification / risk / credit days) + a company-
-- configurable order-block policy (trigger → mode). Reuses erp_customers
-- (credit_limit / balance) + the credit-limit request workflow (0141). INERT
-- until KAKO_COMMERCIAL is on. Company-scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_customer_credit_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id          uuid NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  credit_classification text,
  risk_category        text,
  risk_score           numeric(5,2),
  credit_days          integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_credit_company  ON erp_customer_credit_profiles (company_id);
CREATE INDEX IF NOT EXISTS idx_customer_credit_customer ON erp_customer_credit_profiles (customer_id);
ALTER TABLE erp_customer_credit_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_customer_credit_tenant ON erp_customer_credit_profiles;
CREATE POLICY erp_customer_credit_tenant ON erp_customer_credit_profiles FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Company-configurable order-block policy (trigger → block mode).
CREATE TABLE IF NOT EXISTS erp_credit_block_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  trigger     text NOT NULL CHECK (trigger IN ('credit_limit_exceeded','overdue_balance','high_risk','collection_issue')),
  block_mode  text NOT NULL CHECK (block_mode IN ('hard_block','soft_block','warning','approval_required','none')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, trigger)
);
CREATE INDEX IF NOT EXISTS idx_credit_block_rules_company ON erp_credit_block_rules (company_id);
ALTER TABLE erp_credit_block_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_credit_block_rules_tenant ON erp_credit_block_rules;
CREATE POLICY erp_credit_block_rules_tenant ON erp_credit_block_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
