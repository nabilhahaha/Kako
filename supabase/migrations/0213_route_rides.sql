-- ============================================================================
-- 0213: Route Riding Excellence — rides + evaluations + coaching (Phase 3 FMCG)
-- ----------------------------------------------------------------------------
-- The Route Riding execution + evaluation + coaching + acknowledgement records.
-- A ride = plan + execution + rollup scores + coaching + acknowledgement on one
-- header, with per-customer evaluations (linked to the REUSED erp_visits) and a
-- coaching action plan. Photos reuse the polymorphic erp_attachments (reference
-- type 'route_ride' / 'route_ride_customer'). Criteria are SNAPSHOTTED on each
-- evaluation (audit-first; survives criterion edits). Additive + INERT until
-- KAKO_ROUTE_RIDING is on. Company-scoped RLS. Depends on 0005, 0014, 0018,
-- 0062, 0212.
-- ============================================================================

-- Ride header: plan + execution + scores + coaching + acknowledgement.
CREATE TABLE IF NOT EXISTS erp_route_rides (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id                   uuid REFERENCES erp_branches(id) ON DELETE SET NULL,
  supervisor_id               uuid NOT NULL,                 -- the rider (auth.users; erp convention: no FK)
  salesman_id                 uuid NOT NULL,                 -- the salesman being ridden with
  route_id                    uuid REFERENCES erp_routes(id) ON DELETE SET NULL,
  ride_type                   text NOT NULL
                                CHECK (ride_type IN ('coaching','evaluation','new_joiner','corrective_action','audit','regional_manager')),
  planned_date                date NOT NULL,
  planned_customer_count      integer NOT NULL DEFAULT 0,
  planned_duration_min        integer,
  status                      text NOT NULL DEFAULT 'planned'
                                CHECK (status IN ('planned','in_progress','completed','pending_acknowledgement','acknowledged','closed','cancelled')),
  -- execution
  supervisor_check_in_at      timestamptz,
  supervisor_check_in_lat     numeric(9,6),
  supervisor_check_in_lng     numeric(9,6),
  salesman_check_in_at        timestamptz,
  salesman_check_in_lat       numeric(9,6),
  salesman_check_in_lng       numeric(9,6),
  joint_gps_status            text,
  start_time                  timestamptz,
  end_time                    timestamptz,
  ride_duration_min           integer,
  visited_customer_count      integer NOT NULL DEFAULT 0,
  missed_customer_count       integer NOT NULL DEFAULT 0,
  route_compliance_pct        numeric(5,2),
  -- scores
  ride_score                  numeric(5,2),
  category_scores             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- category -> 0..100
  band                        text,
  -- coaching
  strengths                   text,
  weaknesses                  text,
  -- acknowledgement / review (Supervisor → Salesman Review → Acknowledgement → Follow-up)
  supervisor_comment          text,
  salesman_comment            text,
  salesman_acknowledged_at    timestamptz,
  salesman_acknowledged_by    uuid,
  area_manager_reviewed_at    timestamptz,
  area_manager_reviewed_by    uuid,
  regional_manager_reviewed_at timestamptz,
  regional_manager_reviewed_by uuid,
  follow_up_required          boolean NOT NULL DEFAULT false,
  follow_up_date              date,
  -- audit
  created_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
-- FK-covering (first index col = FK col) + query indexes.
CREATE INDEX IF NOT EXISTS idx_route_rides_company    ON erp_route_rides (company_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_route_rides_branch     ON erp_route_rides (branch_id);
CREATE INDEX IF NOT EXISTS idx_route_rides_route      ON erp_route_rides (route_id);
CREATE INDEX IF NOT EXISTS idx_route_rides_salesman   ON erp_route_rides (salesman_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_route_rides_supervisor ON erp_route_rides (supervisor_id, planned_date);

ALTER TABLE erp_route_rides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_route_rides_tenant ON erp_route_rides;
CREATE POLICY erp_route_rides_tenant ON erp_route_rides FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Per-customer rows on a ride (links to the REUSED erp_visits record).
CREATE TABLE IF NOT EXISTS erp_route_ride_customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  ride_id        uuid NOT NULL REFERENCES erp_route_rides(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  visit_id       uuid REFERENCES erp_visits(id) ON DELETE SET NULL,
  sequence       integer NOT NULL DEFAULT 0,
  planned        boolean NOT NULL DEFAULT true,
  visited        boolean NOT NULL DEFAULT false,
  missed         boolean NOT NULL DEFAULT false,
  customer_score numeric(5,2),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_route_ride_customers_company  ON erp_route_ride_customers (company_id);
CREATE INDEX IF NOT EXISTS idx_route_ride_customers_ride     ON erp_route_ride_customers (ride_id);
CREATE INDEX IF NOT EXISTS idx_route_ride_customers_customer ON erp_route_ride_customers (customer_id);
CREATE INDEX IF NOT EXISTS idx_route_ride_customers_visit    ON erp_route_ride_customers (visit_id);

ALTER TABLE erp_route_ride_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_route_ride_customers_tenant ON erp_route_ride_customers;
CREATE POLICY erp_route_ride_customers_tenant ON erp_route_ride_customers FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Per-criterion evaluation scores (criterion snapshotted for audit-safety).
CREATE TABLE IF NOT EXISTS erp_route_ride_evaluations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  ride_customer_id uuid NOT NULL REFERENCES erp_route_ride_customers(id) ON DELETE CASCADE,
  criterion_id     uuid REFERENCES erp_route_ride_criteria(id) ON DELETE SET NULL,
  category         text NOT NULL,     -- snapshot
  criterion_code   text NOT NULL,     -- snapshot
  score            numeric(6,2) NOT NULL,
  comment          text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_ride_evals_company    ON erp_route_ride_evaluations (company_id);
CREATE INDEX IF NOT EXISTS idx_route_ride_evals_ridecust   ON erp_route_ride_evaluations (ride_customer_id);
CREATE INDEX IF NOT EXISTS idx_route_ride_evals_criterion  ON erp_route_ride_evaluations (criterion_id);

ALTER TABLE erp_route_ride_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_route_ride_evals_tenant ON erp_route_ride_evaluations;
CREATE POLICY erp_route_ride_evals_tenant ON erp_route_ride_evaluations FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Coaching action plan items.
CREATE TABLE IF NOT EXISTS erp_route_ride_actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  ride_id             uuid NOT NULL REFERENCES erp_route_rides(id) ON DELETE CASCADE,
  description         text NOT NULL,
  due_date            date,
  responsible_user_id uuid,
  follow_up           boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_route_ride_actions_company ON erp_route_ride_actions (company_id);
CREATE INDEX IF NOT EXISTS idx_route_ride_actions_ride    ON erp_route_ride_actions (ride_id);

ALTER TABLE erp_route_ride_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_route_ride_actions_tenant ON erp_route_ride_actions;
CREATE POLICY erp_route_ride_actions_tenant ON erp_route_ride_actions FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
