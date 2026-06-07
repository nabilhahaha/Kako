-- ============================================================================
-- 0177: Workflow step generalization for the runtime (Constitution Art. 32)
-- ----------------------------------------------------------------------------
-- Schema prerequisites so the generalized runtime (TS executors) can store +
-- execute non-approval step types. Additive + non-breaking:
--   1. Allow `step_type = 'reject'` (the 9th executor type).
--   2. Make `approver_type` NULLable — automated steps (notification, api_call,
--      delay, condition, update_record, task, escalation, reject) have no human
--      approver. Approval steps still set it (legacy behaviour unchanged; the
--      CHECK still constrains non-null values to the allowed set).
-- No existing column is dropped and no engine RPC/business logic is changed.
-- Depends on 0176.
-- ============================================================================

-- 1. Extend the step_type allow-list to include 'reject'.
ALTER TABLE erp_workflow_steps DROP CONSTRAINT IF EXISTS erp_workflow_steps_step_type_chk;
ALTER TABLE erp_workflow_steps ADD CONSTRAINT erp_workflow_steps_step_type_chk
  CHECK (step_type IN ('condition','approval','reject','task','notification','api_call','update_record','delay','escalation'));

-- 2. Automated steps have no approver → relax NOT NULL (the original CHECK on
--    approver_type already passes for NULL; only approval steps populate it).
ALTER TABLE erp_workflow_steps ALTER COLUMN approver_type DROP NOT NULL;

-- Down (manual): re-add NOT NULL after backfilling automated rows; restore the
--                8-type CHECK without 'reject'.
