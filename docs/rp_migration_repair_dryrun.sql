-- ============================================================================
-- Route Planner — Migration tracking reconciliation (0358–0364)
-- DRY-RUN SCRIPT — RUN ON AN ISOLATED CLONE / BRANCH ONLY. NEVER ON PRODUCTION.
-- ============================================================================
-- Purpose: verify that recording migrations 0358–0364 as "applied" is safe,
--          given their schema objects ALREADY EXIST in production but are not
--          recorded in supabase_migrations.schema_migrations.
--
-- Production reconciliation requires separate, explicit human approval AFTER
-- this dry-run passes on a clone. This file performs NO production action.
--
-- IMPORTANT — confirm the deploy convention FIRST (see handoff report):
--   Existing rows use  version = 14-digit APPLY-TIMESTAMP,  name = file stem
--   (e.g. version '20260620142410', name '0357_rp_schema_health').
--   The reconciliation below INTENTIONALLY matches that convention.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 0 (clone setup, run in shell — NOT SQL):
--   Create an isolated branch/clone of vantora-staging, e.g.
--     supabase branches create rp-drift-dryrun --experimental
--   OR dump+restore into a scratch project. A fresh branch will contain
--   0353–0357 objects (recorded) but NOT 0358–0364 objects. To faithfully
--   reproduce production drift, apply the 0358–0364 SQL WITHOUT recording it:
--     psql "$CLONE_URL" -f supabase/migrations/0358_rp_connector_admin.sql
--     psql "$CLONE_URL" -f supabase/migrations/0359_rp_planning_persistence_a.sql
--     psql "$CLONE_URL" -f supabase/migrations/0360_rp_dataset_persistence.sql
--     psql "$CLONE_URL" -f supabase/migrations/0361_rp_saved_plans.sql
--     psql "$CLONE_URL" -f supabase/migrations/0362_rp_mission_perms.sql
--     psql "$CLONE_URL" -f supabase/migrations/0363_rp_missions.sql
--     psql "$CLONE_URL" -f supabase/migrations/0364_rp_plan_approvals.sql
--   (Do NOT use `supabase db push` here — that would both apply AND record,
--    which would not reproduce the unrecorded-drift state we need to test.)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- STEP 1 — BASELINE (expect: 0353–0357 recorded; 0358–0364 NOT recorded)
-- ----------------------------------------------------------------------------
select version, name
from supabase_migrations.schema_migrations
where name ~ '^03(5[3-9]|6[0-4])_'
order by version;

-- Object existence (expect: all 15 RP tables present on the clone after STEP 0)
select count(*) as rp_tables_present
from (values
  ('erp_route_planner_access'),('erp_rp_data_sources'),('erp_rp_field_mappings'),('erp_rp_sync_runs'),
  ('erp_route_planner_requests'),('erp_rp_approval_flows'),('erp_rp_request_counters'),('erp_rp_segments'),
  ('erp_rp_datasets'),('erp_rp_dataset_customers'),('erp_rp_day_plans'),('erp_rp_journey_plans'),
  ('erp_rp_missions'),('erp_rp_mission_stops'),('erp_rp_mission_events')) v(t)
where to_regclass('public.'||t) is not null;

-- Capture a data-integrity fingerprint BEFORE repair (compare to STEP 4).
select 'before' as phase,
       (select count(*) from erp_route_planner_access)   as access_rows,
       (select count(*) from erp_route_planner_requests) as request_rows,
       (select count(*) from erp_rp_approval_flows)       as approval_rows,
       (select count(*) from erp_rp_data_sources)         as datasource_rows,
       (select count(*) from erp_rp_field_mappings)       as mapping_rows,
       (select count(*) from erp_rp_sync_runs)            as syncrun_rows,
       (select count(*) from erp_rp_request_counters)     as counter_rows;

-- ----------------------------------------------------------------------------
-- STEP 2 — REPAIR (metadata-only). Wrap in a transaction so the clone run is
--          auditable. This INSERTS tracking rows ONLY — no object DDL, no DML.
--
-- PATH B (recommended — matches the existing (timestamp, stem) convention):
--   Versions below are EXAMPLES that sort AFTER 0357 (20260620142410). Replace
--   with the real apply-timestamps your pipeline would assign, preserving order
--   0358 < 0359 < ... < 0364.
-- ----------------------------------------------------------------------------
begin;

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260620142420','0358_rp_connector_admin'),
  ('20260620142430','0359_rp_planning_persistence_a'),
  ('20260620142440','0360_rp_dataset_persistence'),
  ('20260620142450','0361_rp_saved_plans'),
  ('20260620142500','0362_rp_mission_perms'),
  ('20260620142510','0363_rp_missions'),
  ('20260620142520','0364_rp_plan_approvals');

-- Sanity check inside the txn: expect 12 RP rows total (0353–0364), 0 duplicates.
select count(*) as rp_rows_total
from supabase_migrations.schema_migrations
where name ~ '^03(5[3-9]|6[0-4])_';

commit;   -- on the CLONE only. (Use ROLLBACK to abort the dry-run harmlessly.)

-- ----------------------------------------------------------------------------
-- PATH A (alternative — Supabase CLI). Only if your pipeline applies these via
-- the CLI with timestamp-renamed files. NOTE: `migration repair 0358` keys on
-- the version token; with 0XXX filenames it may record version='0358' and
-- DIVERGE from the timestamp convention above. Confirm before using.
--   supabase migration repair --status applied 0358 0359 0360 0361 0362 0363 0364
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- STEP 3 — POST-REPAIR migration state (expect: 0353–0364 all recorded)
-- ----------------------------------------------------------------------------
select version, name
from supabase_migrations.schema_migrations
where name ~ '^03(5[3-9]|6[0-4])_'
order by version;

-- Then in shell (expect: "no pending" / nothing to apply, and clean diff):
--   supabase migration list      # all 0353–0364 show as applied on remote
--   supabase db diff             # MUST report no schema differences

-- ----------------------------------------------------------------------------
-- STEP 4 — INTEGRITY (expect: identical to STEP 1 "before" fingerprint)
-- ----------------------------------------------------------------------------
select 'after' as phase,
       (select count(*) from erp_route_planner_access)   as access_rows,
       (select count(*) from erp_route_planner_requests) as request_rows,
       (select count(*) from erp_rp_approval_flows)       as approval_rows,
       (select count(*) from erp_rp_data_sources)         as datasource_rows,
       (select count(*) from erp_rp_field_mappings)       as mapping_rows,
       (select count(*) from erp_rp_sync_runs)            as syncrun_rows,
       (select count(*) from erp_rp_request_counters)     as counter_rows;

-- Object existence again (expect: still 15).
select count(*) as rp_tables_present
from (values
  ('erp_route_planner_access'),('erp_rp_data_sources'),('erp_rp_field_mappings'),('erp_rp_sync_runs'),
  ('erp_route_planner_requests'),('erp_rp_approval_flows'),('erp_rp_request_counters'),('erp_rp_segments'),
  ('erp_rp_datasets'),('erp_rp_dataset_customers'),('erp_rp_day_plans'),('erp_rp_journey_plans'),
  ('erp_rp_missions'),('erp_rp_mission_stops'),('erp_rp_mission_events')) v(t)
where to_regclass('public.'||t) is not null;

-- ----------------------------------------------------------------------------
-- STEP 5 — CLEANUP (shell): delete the clone/branch when the report is done.
--   supabase branches delete rp-drift-dryrun --experimental
-- ----------------------------------------------------------------------------
