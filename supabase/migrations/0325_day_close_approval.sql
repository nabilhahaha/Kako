-- 0325 — End Day Approval & Settlement Workflow, Phase A (schema foundation).
--
-- POLICY-DRIVEN, configurable multi-stage day close. A van day is NOT closed when
-- the salesman taps End Day; it is submitted and runs a configurable chain of
-- stages (Supervisor Review → Inventory Reconciliation → Financial Settlement)
-- before it is truly Closed. Each stage is independently enabled and ASSIGNED TO A
-- ROLE (not hardcoded warehouse/cashier). Separation-of-duties optional. Mirrors
-- the Return Approval pattern: Capability → Company Policy → Role Permission.
-- ADDITIVE + flag-gated (platform.day_close_approval, default OFF): when OFF the
-- existing direct erp_close_day behaviour is unchanged.

-- 1) Per-company policy: which stages, role per stage, order, separation-of-duties.
CREATE TABLE IF NOT EXISTS erp_day_close_policies (
  company_id           uuid PRIMARY KEY,
  mode                 text NOT NULL DEFAULT 'direct' CHECK (mode IN ('direct','custom')),
  supervisor_enabled   boolean NOT NULL DEFAULT false,
  reconcile_enabled    boolean NOT NULL DEFAULT false,
  settle_enabled       boolean NOT NULL DEFAULT false,
  -- role assigned to each stage (role key, e.g. 'supervisor'/'warehouse_keeper'/'cashier', or 'any')
  supervisor_role      text,
  reconcile_role       text,
  settle_role          text,
  stage_order          text[] NOT NULL DEFAULT ARRAY['supervisor','reconcile','settle'],
  separation_of_duties boolean NOT NULL DEFAULT false,
  cash_variance_tol    numeric,
  stock_variance_tol   numeric,
  sla_hours            numeric,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid
);

-- 2) The day-close request: drives the settlement state machine. The work session's
--    own status flips to 'closed' only at the very end (like Return Approval keeps a
--    return pending until posted). One request per work session.
CREATE TABLE IF NOT EXISTS erp_day_close_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL,
  work_session_id    uuid NOT NULL UNIQUE,
  branch_id          uuid,
  salesman_id        uuid NOT NULL,
  status             text NOT NULL CHECK (status IN (
                       'pending_supervisor','supervisor_rejected',
                       'pending_reconciliation','reconciliation_rejected',
                       'pending_settlement','settlement_rejected',
                       'closed','reopened')),
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  -- canonical per-stage audit fields (never collapsed)
  supervisor_by      uuid, supervisor_at  timestamptz, supervisor_reason  text,
  reconcile_by       uuid, reconcile_at   timestamptz, reconcile_reason   text, stock_variance numeric,
  settle_by          uuid, settle_at      timestamptz, settle_reason      text, cash_variance  numeric,
  closed_by          uuid, closed_at      timestamptz,
  reopened_by        uuid, reopened_at    timestamptz, reopen_reason      text,
  first_viewed_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS erp_day_close_requests_co_status_idx ON erp_day_close_requests (company_id, status);
CREATE INDEX IF NOT EXISTS erp_day_close_requests_branch_idx ON erp_day_close_requests (branch_id, status);

-- 3) Full, non-collapsed audit: one row per stage action (even when one user performs
--    several stages). Captures who/role/decision/reason/variance.
CREATE TABLE IF NOT EXISTS erp_day_close_stage_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES erp_day_close_requests(id) ON DELETE CASCADE,
  stage         text NOT NULL CHECK (stage IN ('supervisor','reconcile','settle')),
  decision      text NOT NULL CHECK (decision IN ('approve','reject')),
  actor         uuid NOT NULL,
  role_at_action text,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  reason        text,
  comment       text,
  variance      numeric,
  payload       jsonb
);
CREATE INDEX IF NOT EXISTS erp_day_close_stage_events_req_idx ON erp_day_close_stage_events (request_id, decided_at);

-- 4) RLS — company-scoped (policies) / branch-access-scoped (requests + events).
ALTER TABLE erp_day_close_policies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_day_close_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_day_close_stage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_day_close_policies_rw ON erp_day_close_policies;
CREATE POLICY erp_day_close_policies_rw ON erp_day_close_policies
  FOR ALL USING (company_id = erp_user_company_id()) WITH CHECK (company_id = erp_user_company_id());

DROP POLICY IF EXISTS erp_day_close_requests_rw ON erp_day_close_requests;
CREATE POLICY erp_day_close_requests_rw ON erp_day_close_requests
  FOR ALL USING (erp_has_branch_access(branch_id)) WITH CHECK (erp_has_branch_access(branch_id));

DROP POLICY IF EXISTS erp_day_close_stage_events_rw ON erp_day_close_stage_events;
CREATE POLICY erp_day_close_stage_events_rw ON erp_day_close_stage_events
  FOR ALL USING (EXISTS (SELECT 1 FROM erp_day_close_requests r WHERE r.id = request_id AND erp_has_branch_access(r.branch_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM erp_day_close_requests r WHERE r.id = request_id AND erp_has_branch_access(r.branch_id)));
