-- ============================================================================
-- 0195: Trade Spend Foundation — promotions, accruals, claims (Phase 4)
-- ----------------------------------------------------------------------------
-- The multi-tenant erp_trade_spend_* model the accrual + claims engines persist
-- into (Phase 4 inc.1/2). New platform-native module — NOT the legacy permissive
-- ts_* prototype (left untouched). Company-scoped RLS (promotions/accruals/claims
-- are company-level, like erp_ap_ledger).
--   * erp_trade_promotions      — promo terms (method/rate/percent/lump/cap), period, status
--   * erp_trade_accruals        — per-period accrual ledger (engine output)
--   * erp_trade_claims          — customer claims/deductions (+ over-claim)
--   * erp_trade_claim_allocations — claim ↔ promotion settled amounts
-- Additive + INERT: nothing writes these until KAKO_TRADE_SPEND is on; no posting
-- until the GL increment (reuses the Phase-1 engine, distinct reference types).
-- Depends on 0005 (erp_companies/_branches/_customers), 0018 (erp_user_company_id/
-- erp_is_platform_owner).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_trade_promotions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES erp_branches(id) ON DELETE SET NULL,
  customer_id   uuid REFERENCES erp_customers(id) ON DELETE SET NULL,   -- null = all customers/channel
  name          text NOT NULL,
  spend_type    text,                                                   -- free/company-managed label
  method        text NOT NULL CHECK (method IN ('percent_of_sales','rate_per_unit','lump_sum')),
  percent       numeric(7,4),
  rate          numeric(14,4),
  lump_sum      numeric(14,2),
  cap           numeric(14,2),
  period_start  date,
  period_end    date,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','closed','cancelled')),
  notes         text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_promotions_company  ON erp_trade_promotions (company_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_promotions_branch   ON erp_trade_promotions (branch_id);
CREATE INDEX IF NOT EXISTS idx_trade_promotions_customer ON erp_trade_promotions (customer_id);

CREATE TABLE IF NOT EXISTS erp_trade_accruals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  promotion_id    uuid NOT NULL REFERENCES erp_trade_promotions(id) ON DELETE CASCADE,
  period_date     date NOT NULL DEFAULT CURRENT_DATE,
  sales_value     numeric(14,2) NOT NULL DEFAULT 0,
  units           numeric(14,3) NOT NULL DEFAULT 0,
  accrued_amount  numeric(14,2) NOT NULL CHECK (accrued_amount >= 0),
  method          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, period_date)                                    -- one accrual per promo per period (upsert)
);
CREATE INDEX IF NOT EXISTS idx_trade_accruals_company   ON erp_trade_accruals (company_id, period_date);
CREATE INDEX IF NOT EXISTS idx_trade_accruals_promotion ON erp_trade_accruals (promotion_id);

CREATE TABLE IF NOT EXISTS erp_trade_claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES erp_customers(id) ON DELETE RESTRICT,
  claim_number      text,
  claim_date        date NOT NULL DEFAULT CURRENT_DATE,
  amount            numeric(14,2) NOT NULL,
  applied_amount    numeric(14,2) NOT NULL DEFAULT 0,
  over_claim_amount numeric(14,2) NOT NULL DEFAULT 0,                   -- unbacked → dispute
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','matched','disputed','settled','cancelled')),
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trade_claims_company  ON erp_trade_claims (company_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_claims_customer ON erp_trade_claims (customer_id);

CREATE TABLE IF NOT EXISTS erp_trade_claim_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       uuid NOT NULL REFERENCES erp_trade_claims(id) ON DELETE CASCADE,
  promotion_id   uuid NOT NULL REFERENCES erp_trade_promotions(id) ON DELETE RESTRICT,
  applied_amount numeric(14,2) NOT NULL CHECK (applied_amount > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, promotion_id)
);
CREATE INDEX IF NOT EXISTS idx_trade_claim_alloc_claim     ON erp_trade_claim_allocations (claim_id);
CREATE INDEX IF NOT EXISTS idx_trade_claim_alloc_promotion ON erp_trade_claim_allocations (promotion_id);

-- ── RLS: company-scoped (platform owner sees all), mirroring erp_ap_ledger ───
ALTER TABLE erp_trade_promotions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_trade_accruals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_trade_claims            ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_trade_claim_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_trade_promotions_tenant ON erp_trade_promotions;
CREATE POLICY erp_trade_promotions_tenant ON erp_trade_promotions FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP POLICY IF EXISTS erp_trade_accruals_tenant ON erp_trade_accruals;
CREATE POLICY erp_trade_accruals_tenant ON erp_trade_accruals FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP POLICY IF EXISTS erp_trade_claims_tenant ON erp_trade_claims;
CREATE POLICY erp_trade_claims_tenant ON erp_trade_claims FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP POLICY IF EXISTS erp_trade_claim_alloc_tenant ON erp_trade_claim_allocations;
CREATE POLICY erp_trade_claim_alloc_tenant ON erp_trade_claim_allocations FOR ALL
  USING (claim_id IN (SELECT id FROM erp_trade_claims WHERE erp_is_platform_owner() OR company_id = erp_user_company_id()))
  WITH CHECK (claim_id IN (SELECT id FROM erp_trade_claims WHERE erp_is_platform_owner() OR company_id = erp_user_company_id()));
