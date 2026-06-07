-- ============================================================================
-- 0193: Distribution Foundation — persisted rep-day KPI snapshots
-- ----------------------------------------------------------------------------
-- A daily KPI read-model snapshot per salesman, so supervisor dashboards/trends
-- have aggregated history without recomputing from raw visits each time (the
-- surveyed "no aggregated KPI tables" gap). Populated by the snapshot service
-- (next increment) from the coverage read-model. Additive + INERT: nothing writes
-- it until KAKO_DISTRIBUTION is on; computing/persisting it changes no existing
-- behaviour. Branch-scoped RLS mirroring erp_visits.
-- Depends on 0005 (erp_companies/_branches, erp_user_branch_ids()).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rep_day_kpis (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id          uuid NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  salesman_id        uuid NOT NULL,                          -- auth.users (no FK, mirrors erp_visits)
  kpi_date           date NOT NULL,
  planned            integer NOT NULL DEFAULT 0,
  visited            integer NOT NULL DEFAULT 0,
  planned_visited    integer NOT NULL DEFAULT 0,
  missed             integer NOT NULL DEFAULT 0,
  off_route          integer NOT NULL DEFAULT 0,
  productive         integer NOT NULL DEFAULT 0,
  coverage_pct       numeric(5,1) NOT NULL DEFAULT 0,
  adherence_pct      numeric(5,1) NOT NULL DEFAULT 0,
  strike_rate_pct    numeric(5,1) NOT NULL DEFAULT 0,
  computed_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salesman_id, kpi_date)                             -- one snapshot per rep-day (upsert)
);
-- FK-covering + dashboard-lookup indexes (schema-health: first index col = FK col).
CREATE INDEX IF NOT EXISTS idx_rep_day_kpis_company ON erp_rep_day_kpis (company_id, kpi_date);
CREATE INDEX IF NOT EXISTS idx_rep_day_kpis_branch  ON erp_rep_day_kpis (branch_id, kpi_date);

ALTER TABLE erp_rep_day_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_rep_day_kpis_select ON erp_rep_day_kpis;
CREATE POLICY erp_rep_day_kpis_select ON erp_rep_day_kpis FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));
DROP POLICY IF EXISTS erp_rep_day_kpis_manage ON erp_rep_day_kpis;
CREATE POLICY erp_rep_day_kpis_manage ON erp_rep_day_kpis FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()))
  WITH CHECK (branch_id = ANY(erp_user_branch_ids()));
