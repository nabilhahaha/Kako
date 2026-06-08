-- ============================================================================
-- 0214: Territory Ownership History (Phase 3 FMCG, shared foundation)
-- ----------------------------------------------------------------------------
-- A generic, effective-dated ownership ledger reused by Territory Planning, Route
-- Riding, KPI attribution, and the Customer Timeline. Tracks who owns each entity
-- (customer/route/salesman/supervisor/area/region) over time. NEVER overwritten:
-- a change closes the prior interval (effective_to) and opens a new one — a unique
-- partial index enforces a single OPEN interval per (entity, owner dimension).
-- Point-in-time queries attribute sales/collections/coverage/compliance/KPIs to
-- the owner AT EXECUTION TIME. Additive + INERT until KAKO_ROUTE_OPTIMIZATION is
-- on. Company-scoped RLS. Depends on 0005, 0018.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_ownership_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  entity_type    text NOT NULL CHECK (entity_type IN ('customer','route','salesman','supervisor','area','region')),
  entity_id      uuid NOT NULL,
  owner_type     text NOT NULL CHECK (owner_type IN ('salesman','supervisor','area_manager','regional_manager','route','area','region')),
  owner_id       uuid NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  reason         text,
  changed_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- FK-covering (first index col = company_id) + point-in-time + owner lookups.
CREATE INDEX IF NOT EXISTS idx_ownership_history_company ON erp_ownership_history (company_id);
CREATE INDEX IF NOT EXISTS idx_ownership_history_entity  ON erp_ownership_history (entity_type, entity_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_ownership_history_owner   ON erp_ownership_history (owner_type, owner_id);
-- One OPEN interval per (entity, owner dimension) — integrity, no double-ownership.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ownership_history_open
  ON erp_ownership_history (entity_type, entity_id, owner_type) WHERE effective_to IS NULL;

ALTER TABLE erp_ownership_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_ownership_history_tenant ON erp_ownership_history;
CREATE POLICY erp_ownership_history_tenant ON erp_ownership_history FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
