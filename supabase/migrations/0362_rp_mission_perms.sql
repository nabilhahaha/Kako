-- 0362: Thin admin slice — per-user Supervisor-Mission permissions.
--
-- Before Supervisor Missions, give a company admin the MINIMUM control needed: per user,
-- can they Create missions, Assign missions to others, and Review mission reports (Execute
-- is implicit for anyone with the field_missions feature). Stored as a small jsonb override
-- on the existing Route Planner access row (migration 0353) — NO new table, reuses the
-- access model + Reporting Graph for hierarchy visibility. Absent keys fall back to the
-- role default (resolved in route-planner-access.ts). NOT APPLIED yet — for review.

ALTER TABLE erp_route_planner_access
  ADD COLUMN IF NOT EXISTS mission_perms jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Shape guard: only the four known keys may appear (subquery-free — remove the allowed
-- keys and the remainder must be empty). Values are written as booleans by the app layer.
DO $$ BEGIN
  ALTER TABLE erp_route_planner_access ADD CONSTRAINT rp_access_mission_perms_chk CHECK (
    (mission_perms - 'create' - 'assign' - 'execute' - 'review') = '{}'::jsonb
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Validation ──────────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_name='erp_route_planner_access' AND column_name='mission_perms';
--
-- ── Rollback (manual) ───────────────────────────────────────────────────────
--   ALTER TABLE erp_route_planner_access DROP CONSTRAINT rp_access_mission_perms_chk;
--   ALTER TABLE erp_route_planner_access DROP COLUMN mission_perms;
