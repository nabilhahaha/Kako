-- ============================================================================
-- 0231: Perfect Store Engine (Phase 7C)
-- ----------------------------------------------------------------------------
-- Company-configurable perfect-store scorecards (channel/region/customer-type
-- weighted pillars + banding thresholds — no hardcoding) and an outlet/period
-- score snapshot for trend + leaderboards. Scoring reuses the existing pillar
-- scorer (src/lib/erp/perfect-store.ts) over MSL (0144) / OOS / distribution KPIs
-- / surveys. Additive + INERT until KAKO_PERFECT_STORE is on. Company-scoped RLS.
-- Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_perfect_store_scorecards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name             text NOT NULL,
  channel          text,
  region_id        uuid,
  customer_type    text,
  pillar_weights   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{key,label,weight}, ...]
  gold_threshold   numeric(5,2) NOT NULL DEFAULT 90,
  silver_threshold numeric(5,2) NOT NULL DEFAULT 75,
  bronze_threshold numeric(5,2) NOT NULL DEFAULT 50,
  priority         integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perfect_store_scorecards_company ON erp_perfect_store_scorecards (company_id, is_active);
ALTER TABLE erp_perfect_store_scorecards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_perfect_store_scorecards_tenant ON erp_perfect_store_scorecards;
CREATE POLICY erp_perfect_store_scorecards_tenant ON erp_perfect_store_scorecards FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Outlet/period perfect-store score snapshot (trend + leaderboard).
CREATE TABLE IF NOT EXISTS erp_perfect_store_scores (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  scorecard_id uuid REFERENCES erp_perfect_store_scorecards(id) ON DELETE SET NULL,
  salesman_id  uuid,
  period       text NOT NULL,                 -- 'YYYY-MM'
  score        numeric(5,2) NOT NULL DEFAULT 0,
  band         text,
  pillar_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, customer_id, period)
);
CREATE INDEX IF NOT EXISTS idx_perfect_store_scores_company   ON erp_perfect_store_scores (company_id, period);
CREATE INDEX IF NOT EXISTS idx_perfect_store_scores_customer  ON erp_perfect_store_scores (customer_id);
CREATE INDEX IF NOT EXISTS idx_perfect_store_scores_scorecard ON erp_perfect_store_scores (scorecard_id);
ALTER TABLE erp_perfect_store_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_perfect_store_scores_tenant ON erp_perfect_store_scores;
CREATE POLICY erp_perfect_store_scores_tenant ON erp_perfect_store_scores FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
