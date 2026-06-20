-- 0356: Request Center foundation + Approval Builder (Route Planner backend).
--
-- Lightweight, trackable tickets for customer-master & route requests. The system
-- NEVER edits official master data: the Admin implements approved changes in the
-- external system, then closes the ticket. Visibility uses the reporting graph
-- (rp_visible_users, 0354). NOT APPLIED to staging yet — for review.

-- ── Per-company ticket-number counter (RP-REQ-YYYY-####) ────────────────────
CREATE TABLE IF NOT EXISTS erp_rp_request_counters (
  company_id uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  last_no    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year)
);

CREATE OR REPLACE FUNCTION rp_next_ticket_no(p_company uuid)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_year int := EXTRACT(year FROM now())::int; v_no int;
BEGIN
  INSERT INTO erp_rp_request_counters (company_id, year, last_no)
    VALUES (p_company, v_year, 1)
  ON CONFLICT (company_id, year) DO UPDATE SET last_no = erp_rp_request_counters.last_no + 1
  RETURNING last_no INTO v_no;
  RETURN 'RP-REQ-' || v_year || '-' || lpad(v_no::text, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION rp_next_ticket_no(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION rp_next_ticket_no(uuid) TO authenticated;

-- ── Requests (tickets) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_route_planner_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  ticket_no     text,
  type          text NOT NULL,
  requested_by  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  requested_role text,
  customer_ref  text,                       -- code / name (external master)
  customer_id   uuid,                        -- optional match to an uploaded row
  changes       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { field: { old, new } }
  reason        text,
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- photo/file refs
  gps_lat       double precision,
  gps_lng       double precision,
  status        text NOT NULL DEFAULT 'created',
  current_stage text,                        -- which approval stage is pending
  assignee_id   uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  events        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- comment/status history
  reconciliation jsonb,                      -- reflected / not_reflected / cant_verify
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_req_type_chk CHECK (type IN
    ('new_customer','update','temp_stop','perm_stop','reassignment','location_fix','route_change')),
  CONSTRAINT rp_req_status_chk CHECK (status IN
    ('created','pending_manager_review','approved','pending_admin_action','implemented_externally',
     'closed','rejected','need_more_info','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_rp_req_company ON erp_route_planner_requests (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_req_requested_by ON erp_route_planner_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_rp_req_assignee ON erp_route_planner_requests (assignee_id);
CREATE INDEX IF NOT EXISTS idx_rp_req_status ON erp_route_planner_requests (company_id, status);

-- ── Approval Builder: per ticket type, a configurable stage flow ────────────
CREATE TABLE IF NOT EXISTS erp_rp_approval_flows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  ticket_type text NOT NULL,
  -- [ { stage: create|review|approve|implement|close,
  --     assign_by: role|relation|user,
  --     role?, relation? (direct_manager|managers_manager|subtree), user_id? } ]
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  updated_by  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_flow_type_chk CHECK (ticket_type IN
    ('new_customer','update','temp_stop','perm_stop','reassignment','location_fix','route_change')),
  CONSTRAINT uq_rp_flow UNIQUE (company_id, ticket_type)
);
CREATE INDEX IF NOT EXISTS idx_rp_flow_company ON erp_rp_approval_flows (company_id);
CREATE INDEX IF NOT EXISTS idx_rp_flow_updated_by ON erp_rp_approval_flows (updated_by);  -- FK covering index

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE erp_rp_request_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rp_counter_all ON erp_rp_request_counters;
CREATE POLICY rp_counter_all ON erp_rp_request_counters FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Requests: a user sees tickets in their reporting VISIBILITY (own + subtree) or that
-- are assigned to them; company admins see all in the company. Create = own ticket;
-- updates = company admin / assignee (workflow transitions enforced in the action layer).
ALTER TABLE erp_route_planner_requests ENABLE ROW LEVEL SECURITY;
-- auth.uid() is wrapped as (select auth.uid()) per the RLS init-plan invariant.
DROP POLICY IF EXISTS rp_req_sel ON erp_route_planner_requests;
CREATE POLICY rp_req_sel ON erp_route_planner_requests FOR SELECT
  USING (
    erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
        erp_is_company_admin(company_id)
        OR requested_by = (select auth.uid())
        OR assignee_id = (select auth.uid())
        OR rp_can_see_user(requested_by, company_id)))
  );
DROP POLICY IF EXISTS rp_req_ins ON erp_route_planner_requests;
CREATE POLICY rp_req_ins ON erp_route_planner_requests FOR INSERT
  WITH CHECK (company_id = erp_user_company_id() AND requested_by = (select auth.uid()));
DROP POLICY IF EXISTS rp_req_upd ON erp_route_planner_requests;
CREATE POLICY rp_req_upd ON erp_route_planner_requests FOR UPDATE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND (erp_is_company_admin(company_id) OR assignee_id = (select auth.uid()) OR requested_by = (select auth.uid()))))
  WITH CHECK (company_id = erp_user_company_id());

ALTER TABLE erp_rp_approval_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rp_flow_sel ON erp_rp_approval_flows;
CREATE POLICY rp_flow_sel ON erp_rp_approval_flows FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin() OR company_id = erp_user_company_id());
DROP POLICY IF EXISTS rp_flow_wr ON erp_rp_approval_flows;
CREATE POLICY rp_flow_wr ON erp_rp_approval_flows FOR ALL
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
  WITH CHECK (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)));

-- Rollback (manual):
--   DROP TABLE erp_rp_approval_flows, erp_route_planner_requests, erp_rp_request_counters;
--   DROP FUNCTION rp_next_ticket_no(uuid);
