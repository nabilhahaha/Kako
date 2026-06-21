-- 0364: Wave K — approval / review flows for Journey Plans + Daily Plans.
--
-- Reuse the EXISTING Approval Builder + engine (erp_rp_approval_flows + the pure
-- stageState/canApprove engine, no self-approval) for plan sign-off. Two additions:
--   1) allow the approval-flow table to hold flows for 'journey_plan' + 'daily_plan'
--      (relax the type CHECK) — no new flow table, no parallel engine.
--   2) carry approval state on the plan rows (status + stage + immutable event log).
-- Visibility stays on the Reporting Graph. NOT APPLIED yet — for review.

-- ── 1) Allow plan flow types on the shared approval-flow table ───────────────
ALTER TABLE erp_rp_approval_flows DROP CONSTRAINT IF EXISTS rp_flow_type_chk;
ALTER TABLE erp_rp_approval_flows ADD CONSTRAINT rp_flow_type_chk CHECK (ticket_type IN
  ('new_customer','update','temp_stop','perm_stop','reassignment','location_fix','route_change',
   'journey_plan','daily_plan'));

-- ── 2) Approval state on the plan rows ──────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['erp_rp_day_plans','erp_rp_journey_plans']) AS tbl
  LOOP
    EXECUTE format('ALTER TABLE %I
      ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT ''none'',
      ADD COLUMN IF NOT EXISTS approval_stage  text,
      ADD COLUMN IF NOT EXISTS approval_events jsonb NOT NULL DEFAULT ''[]''::jsonb', r.tbl);
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (approval_status IN (''none'',''pending'',''approved'',''rejected''))', r.tbl, r.tbl||'_appr_chk');
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;

-- ── Validation ──────────────────────────────────────────────────────────────
-- SELECT conname FROM pg_constraint WHERE conrelid='erp_rp_approval_flows'::regclass AND conname='rp_flow_type_chk';
-- SELECT column_name FROM information_schema.columns WHERE table_name='erp_rp_day_plans' AND column_name LIKE 'approval%';
--
-- ── Rollback (manual) ───────────────────────────────────────────────────────
--   ALTER TABLE erp_rp_day_plans DROP COLUMN approval_events, DROP COLUMN approval_stage, DROP COLUMN approval_status;
--   ALTER TABLE erp_rp_journey_plans DROP COLUMN approval_events, DROP COLUMN approval_stage, DROP COLUMN approval_status;
--   ALTER TABLE erp_rp_approval_flows DROP CONSTRAINT rp_flow_type_chk;  -- then recreate the 7-type CHECK (0356).
