-- 0363: Supervisor Missions — data model (header + stops + activity events).
--
-- The Planner's field-operations workflow: a manager builds a daily mission/route for a
-- supervisor (ordered customer/market stops); the supervisor executes it on mobile
-- (check-in/out, notes, photos, market issues, competitor observations, opportunities,
-- follow-ups); a report is generated on completion. Reuses the Reporting Graph for
-- visibility, the mission_perms (0362) for capability, and the persisted dataset (0360)
-- for the customer set. Photos reuse the shared erp_attachments (referenced by id in
-- event payloads). NO ERP/sales/finance. NOT APPLIED yet — for review.
--
-- Lifecycle: draft → assigned → in_progress → completed → reviewed → archived.

-- ── Mission header ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_rp_missions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES erp_profiles(id)  ON DELETE CASCADE,   -- manager/author
  assigned_to  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,            -- supervisor who executes
  dataset_id   uuid REFERENCES erp_rp_datasets(id) ON DELETE SET NULL,
  name         text NOT NULL,
  mission_date date,
  status       text NOT NULL DEFAULT 'draft',
  notes        text,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { start, end, optimized:bool, … }
  stop_count   int NOT NULL DEFAULT 0,
  started_at   timestamptz,
  completed_at timestamptz,
  reviewed_by  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_mis_name_chk   CHECK (length(btrim(name)) > 0),
  CONSTRAINT rp_mis_status_chk CHECK (status IN ('draft','assigned','in_progress','completed','reviewed','archived'))
);
CREATE INDEX IF NOT EXISTS idx_rp_mis_company  ON erp_rp_missions (company_id, mission_date DESC);
CREATE INDEX IF NOT EXISTS idx_rp_mis_created   ON erp_rp_missions (created_by);
CREATE INDEX IF NOT EXISTS idx_rp_mis_assigned  ON erp_rp_missions (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_rp_mis_dataset   ON erp_rp_missions (dataset_id);
CREATE INDEX IF NOT EXISTS idx_rp_mis_reviewed  ON erp_rp_missions (reviewed_by);

-- ── Mission stops (the ordered customer/market visits) ──────────────────────
CREATE TABLE IF NOT EXISTS erp_rp_mission_stops (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    uuid NOT NULL REFERENCES erp_rp_missions(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES erp_companies(id)   ON DELETE CASCADE,
  seq           int  NOT NULL DEFAULT 0,
  customer_code text,
  customer_name text NOT NULL,
  lat           double precision,
  lng           double precision,
  status        text NOT NULL DEFAULT 'pending',
  check_in_at   timestamptz,
  check_out_at  timestamptz,
  check_in_lat  double precision,
  check_in_lng  double precision,
  follow_up     boolean NOT NULL DEFAULT false,
  notes         text,
  attrs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT rp_stop_status_chk CHECK (status IN ('pending','checked_in','done','skipped'))
);
CREATE INDEX IF NOT EXISTS idx_rp_stop_mission ON erp_rp_mission_stops (mission_id, seq);
CREATE INDEX IF NOT EXISTS idx_rp_stop_company ON erp_rp_mission_stops (company_id);

-- ── Mission events (activity log: check-in/out, note, photo, issue, …) ───────
CREATE TABLE IF NOT EXISTS erp_rp_mission_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  uuid NOT NULL REFERENCES erp_rp_missions(id)      ON DELETE CASCADE,
  stop_id     uuid REFERENCES erp_rp_mission_stops(id)          ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES erp_companies(id)        ON DELETE CASCADE,
  by_user     uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  kind        text NOT NULL,
  -- { text?, attachments:[uuid], severity?, … } — photos reference erp_attachments by id.
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  gps_lat     double precision,
  gps_lng     double precision,
  at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_ev_kind_chk CHECK (kind IN
    ('start','pause','resume','complete','check_in','check_out','note','photo','issue','competitor','opportunity','follow_up'))
);
CREATE INDEX IF NOT EXISTS idx_rp_ev_mission ON erp_rp_mission_events (mission_id, at);
CREATE INDEX IF NOT EXISTS idx_rp_ev_stop    ON erp_rp_mission_events (stop_id);
CREATE INDEX IF NOT EXISTS idx_rp_ev_company ON erp_rp_mission_events (company_id);
CREATE INDEX IF NOT EXISTS idx_rp_ev_byuser  ON erp_rp_mission_events (by_user);

-- ── RLS — a mission is visible to its author, the assigned supervisor, their reporting
--    subtree (managers see subordinates' missions, the SAME authority as plans/requests),
--    and company admins. Stops + events inherit the mission's visibility. Writes are
--    author/assignee/admin; finer capability (create/assign/review) is enforced in the
--    action layer via mission_perms. ───────────────────────────────────────────
ALTER TABLE erp_rp_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rp_mis_sel ON erp_rp_missions;
CREATE POLICY rp_mis_sel ON erp_rp_missions FOR SELECT
  USING (erp_is_platform_owner() OR erp_is_super_admin()
    OR (company_id = erp_user_company_id() AND (
          erp_is_company_admin(company_id)
          OR created_by = (select auth.uid())
          OR assigned_to = (select auth.uid())
          OR rp_can_see_user(created_by, company_id)
          OR (assigned_to IS NOT NULL AND rp_can_see_user(assigned_to, company_id)))));
DROP POLICY IF EXISTS rp_mis_ins ON erp_rp_missions;
CREATE POLICY rp_mis_ins ON erp_rp_missions FOR INSERT
  WITH CHECK (company_id = erp_user_company_id() AND created_by = (select auth.uid()));
DROP POLICY IF EXISTS rp_mis_upd ON erp_rp_missions;
CREATE POLICY rp_mis_upd ON erp_rp_missions FOR UPDATE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
         AND (erp_is_company_admin(company_id) OR created_by = (select auth.uid()) OR assigned_to = (select auth.uid()))))
  WITH CHECK (company_id = erp_user_company_id());
DROP POLICY IF EXISTS rp_mis_del ON erp_rp_missions;
CREATE POLICY rp_mis_del ON erp_rp_missions FOR DELETE
  USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
         AND (erp_is_company_admin(company_id) OR created_by = (select auth.uid()))));

-- Child tables: visibility + writability inherit the parent mission (EXISTS against PK).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['erp_rp_mission_stops','erp_rp_mission_events']) AS tbl
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_sel', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR SELECT
      USING (erp_is_platform_owner() OR erp_is_super_admin()
        OR (company_id = erp_user_company_id() AND EXISTS (
              SELECT 1 FROM erp_rp_missions m WHERE m.id = mission_id
                AND (erp_is_company_admin(m.company_id) OR m.created_by = (select auth.uid()) OR m.assigned_to = (select auth.uid())
                     OR rp_can_see_user(m.created_by, m.company_id)
                     OR (m.assigned_to IS NOT NULL AND rp_can_see_user(m.assigned_to, m.company_id))))))$p$, r.tbl||'_sel', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_wr', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL
      USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND EXISTS (
              SELECT 1 FROM erp_rp_missions m WHERE m.id = mission_id
                AND (erp_is_company_admin(m.company_id) OR m.created_by = (select auth.uid()) OR m.assigned_to = (select auth.uid())))))
      WITH CHECK (company_id = erp_user_company_id() AND EXISTS (
              SELECT 1 FROM erp_rp_missions m WHERE m.id = mission_id
                AND (erp_is_company_admin(m.company_id) OR m.created_by = (select auth.uid()) OR m.assigned_to = (select auth.uid()))))$p$, r.tbl||'_wr', r.tbl);
  END LOOP;
END $$;

-- ── Validation ──────────────────────────────────────────────────────────────
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_missions'::regclass;        -- 4
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_mission_stops'::regclass;    -- 2
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_mission_events'::regclass;   -- 2
--
-- ── Rollback (manual) ───────────────────────────────────────────────────────
--   DROP TABLE erp_rp_mission_events; DROP TABLE erp_rp_mission_stops; DROP TABLE erp_rp_missions;
