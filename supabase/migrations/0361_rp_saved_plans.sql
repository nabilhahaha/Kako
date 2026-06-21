-- 0361: Wave C — saved planning outputs (Day Plans + Journey Plans).
--
-- Persist the two high-value planning artifacts off the browser (localStorage / in-memory)
-- onto governed, RLS-protected server storage so they reopen across devices, support
-- save/edit/duplicate/archive, and can be manager-created for a supervisor to own. Both
-- optionally reference the persisted dataset (0360). A Daily Visit Plan is generated FROM
-- a Journey Plan (a day plan row with source_journey_id). No ERP data.
--
-- Design source: "VANTORA Planner — Planning Persistence Technical Design", items #3 + #5.

-- ── Day Plans (a built visit sequence: subset + order + start/end) ───────────
CREATE TABLE IF NOT EXISTS erp_rp_day_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES erp_profiles(id)  ON DELETE CASCADE,   -- creator
  assigned_to  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,            -- supervisor who owns execution
  dataset_id   uuid REFERENCES erp_rp_datasets(id) ON DELETE SET NULL,
  source_journey_id uuid,                                                       -- set when generated from a journey
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  -- { order:[], start, end, hasSales, customers:[] } — self-contained snapshot.
  plan         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_dp_name_chk   CHECK (length(btrim(name)) > 0),
  CONSTRAINT rp_dp_status_chk CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_rp_dp_company  ON erp_rp_day_plans (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_dp_owner    ON erp_rp_day_plans (owner_id);
CREATE INDEX IF NOT EXISTS idx_rp_dp_assigned ON erp_rp_day_plans (assigned_to);    -- FK covering
CREATE INDEX IF NOT EXISTS idx_rp_dp_dataset  ON erp_rp_day_plans (dataset_id);      -- FK covering

-- ── Journey Plans (frequency-driven multi-week visit schedule) ──────────────
CREATE TABLE IF NOT EXISTS erp_rp_journey_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES erp_profiles(id)  ON DELETE CASCADE,
  assigned_to  uuid REFERENCES erp_profiles(id) ON DELETE SET NULL,
  dataset_id   uuid REFERENCES erp_rp_datasets(id) ON DELETE SET NULL,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'active',
  frequencies  jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { customerId: frequency }
  -- { assignments:{ id: {customerId,frequency,days,weeks,visitCount} }, dayLoads:[], customers:[] }
  plan         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rp_jp_name_chk   CHECK (length(btrim(name)) > 0),
  CONSTRAINT rp_jp_status_chk CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_rp_jp_company  ON erp_rp_journey_plans (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rp_jp_owner    ON erp_rp_journey_plans (owner_id);
CREATE INDEX IF NOT EXISTS idx_rp_jp_assigned ON erp_rp_journey_plans (assigned_to);
CREATE INDEX IF NOT EXISTS idx_rp_jp_dataset  ON erp_rp_journey_plans (dataset_id);
-- Day plans generated from a journey link back (declared after the journey table exists).
CREATE INDEX IF NOT EXISTS idx_rp_dp_journey  ON erp_rp_day_plans (source_journey_id);

-- ── RLS — visible to the creator, the assigned supervisor, the creator's/assignee's
--    reporting subtree (managers see their team's plans), and company admins. Writes =
--    creator or assignee or admin; create = own. Same authority as Requests/Datasets. ──
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['erp_rp_day_plans','erp_rp_journey_plans']) AS tbl
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_sel', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR SELECT
      USING (erp_is_platform_owner() OR erp_is_super_admin()
        OR (company_id = erp_user_company_id() AND (
              erp_is_company_admin(company_id)
              OR owner_id = (select auth.uid())
              OR assigned_to = (select auth.uid())
              OR rp_can_see_user(owner_id, company_id)
              OR (assigned_to IS NOT NULL AND rp_can_see_user(assigned_to, company_id)))))$p$, r.tbl||'_sel', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_ins', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR INSERT
      WITH CHECK (company_id = erp_user_company_id() AND owner_id = (select auth.uid()))$p$, r.tbl||'_ins', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_upd', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR UPDATE
      USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
             AND (erp_is_company_admin(company_id) OR owner_id = (select auth.uid()) OR assigned_to = (select auth.uid()))))
      WITH CHECK (company_id = erp_user_company_id())$p$, r.tbl||'_upd', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tbl||'_del', r.tbl);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR DELETE
      USING (erp_is_platform_owner() OR (company_id = erp_user_company_id()
             AND (erp_is_company_admin(company_id) OR owner_id = (select auth.uid()))))$p$, r.tbl||'_del', r.tbl);
  END LOOP;
END $$;

-- ── Validation queries ──────────────────────────────────────────────────────
-- SELECT count(*) FROM erp_rp_day_plans;  SELECT count(*) FROM erp_rp_journey_plans;
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_day_plans'::regclass;      -- 4
-- SELECT polname FROM pg_policy WHERE polrelid='erp_rp_journey_plans'::regclass;   -- 4
--
-- ── Rollback (manual) ───────────────────────────────────────────────────────
--   DROP TABLE erp_rp_journey_plans;  DROP TABLE erp_rp_day_plans;
