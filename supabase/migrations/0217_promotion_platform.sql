-- ============================================================================
-- 0217: Enterprise Promotion Platform — master + targeting + funding + budgets (Phase 4+)
-- ----------------------------------------------------------------------------
-- EXTENDS the Phase-4 trade-spend foundation (erp_trade_promotions) into a full
-- promotion platform: richer master (code/description/type/funding model + full
-- status lifecycle), polymorphic targeting (customers/employees/products/docs/
-- time), multi-source funding splits, and budget pools. Additive + INERT until
-- KAKO_PROMOTIONS is on. Company-scoped RLS. Depends on 0005, 0018, 0195.
-- ============================================================================

ALTER TABLE erp_trade_promotions
  ADD COLUMN IF NOT EXISTS code          text,
  ADD COLUMN IF NOT EXISTS description   text,
  ADD COLUMN IF NOT EXISTS promo_type    text,   -- price|free_goods|volume|distribution|execution|collection
  ADD COLUMN IF NOT EXISTS funding_model text;   -- supplier|company|distributor|shared

-- Widen the status lifecycle (idempotent): + pending_approval / approved / expired.
ALTER TABLE erp_trade_promotions DROP CONSTRAINT IF EXISTS erp_trade_promotions_status_check;
ALTER TABLE erp_trade_promotions DROP CONSTRAINT IF EXISTS erp_trade_promotions_status_chk;
ALTER TABLE erp_trade_promotions ADD CONSTRAINT erp_trade_promotions_status_chk
  CHECK (status IN ('draft','pending_approval','approved','active','expired','cancelled','closed'));

-- Polymorphic targeting (customers / employees / products / documents / time).
CREATE TABLE IF NOT EXISTS erp_promotion_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  promotion_id  uuid NOT NULL REFERENCES erp_trade_promotions(id) ON DELETE CASCADE,
  target_kind   text NOT NULL,     -- customer|customer_group|classification|channel|sub_channel|region|city|route|salesman|supervisor|area_manager|regional_manager|merchandiser|sku|brand|category|product_group|invoice|order|time
  target_ref_id uuid,              -- when the target is a row (customer/route/sku/...)
  target_value  text,              -- when the target is a value (channel/time/season/...)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotion_targets_company   ON erp_promotion_targets (company_id);
CREATE INDEX IF NOT EXISTS idx_promotion_targets_promotion ON erp_promotion_targets (promotion_id, target_kind);

ALTER TABLE erp_promotion_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_promotion_targets_tenant ON erp_promotion_targets;
CREATE POLICY erp_promotion_targets_tenant ON erp_promotion_targets FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Multi-source funding split (supplier / company / distributor / shared).
CREATE TABLE IF NOT EXISTS erp_promotion_funding (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES erp_trade_promotions(id) ON DELETE CASCADE,
  source_type  text NOT NULL CHECK (source_type IN ('supplier','company','distributor')),
  supplier_id  uuid REFERENCES erp_suppliers(id) ON DELETE SET NULL,
  percent      numeric(7,4) NOT NULL DEFAULT 0,
  planned_cost numeric(14,2) NOT NULL DEFAULT 0,
  actual_cost  numeric(14,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotion_funding_company   ON erp_promotion_funding (company_id);
CREATE INDEX IF NOT EXISTS idx_promotion_funding_promotion ON erp_promotion_funding (promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_funding_supplier  ON erp_promotion_funding (supplier_id);

ALTER TABLE erp_promotion_funding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_promotion_funding_tenant ON erp_promotion_funding;
CREATE POLICY erp_promotion_funding_tenant ON erp_promotion_funding FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Budget pools (annual / quarterly / monthly) with committed/actual tracking.
CREATE TABLE IF NOT EXISTS erp_promotion_budgets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  period_kind  text NOT NULL CHECK (period_kind IN ('annual','quarterly','monthly')),
  period       text NOT NULL,                 -- 'YYYY' | 'YYYY-Qn' | 'YYYY-MM'
  scope        text,                          -- e.g. 'brand'|'channel'|'region' (optional)
  scope_ref_id uuid,
  amount       numeric(14,2) NOT NULL DEFAULT 0,
  committed    numeric(14,2) NOT NULL DEFAULT 0,
  actual       numeric(14,2) NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotion_budgets_company ON erp_promotion_budgets (company_id, period_kind, period);

ALTER TABLE erp_promotion_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_promotion_budgets_tenant ON erp_promotion_budgets;
CREATE POLICY erp_promotion_budgets_tenant ON erp_promotion_budgets FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
