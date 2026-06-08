-- ============================================================================
-- 0232: Route & Territory Intelligence — health snapshots (Phase 7D)
-- ----------------------------------------------------------------------------
-- Per-entity (route/salesman/territory/supervisor), per-period health snapshot
-- (composite score + components) for trend + multi-level dashboards. Computed by
-- the pure health engine from coverage KPIs + erp_rep_day_kpis (0193), attributed
-- to the owner-at-execution via the ownership ledger (0214). entity_id /
-- territory_id / supervisor_id are generic uuids (no FK — they span routes/users/
-- territories). Additive + INERT until KAKO_ROUTE_INTEL is on. Company-scoped RLS.
-- Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_intel_health_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity_type         text NOT NULL CHECK (entity_type IN ('route','salesman','territory','supervisor')),
  entity_id           uuid NOT NULL,
  period              text NOT NULL,             -- 'YYYY-MM' or 'YYYY-MM-DD'
  health_score        numeric(5,2) NOT NULL DEFAULT 0,
  band                text,
  coverage_pct        numeric(5,2),
  strike_rate_pct     numeric(5,2),
  adherence_pct       numeric(5,2),
  call_compliance_pct numeric(5,2),
  productivity_pct    numeric(5,2),
  missed_customers    integer NOT NULL DEFAULT 0,
  components          jsonb NOT NULL DEFAULT '{}'::jsonb,
  territory_id        uuid,
  supervisor_id       uuid,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity_type, entity_id, period)
);
CREATE INDEX IF NOT EXISTS idx_intel_health_company ON erp_intel_health_snapshots (company_id, entity_type, period);
ALTER TABLE erp_intel_health_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_intel_health_tenant ON erp_intel_health_snapshots;
CREATE POLICY erp_intel_health_tenant ON erp_intel_health_snapshots FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
