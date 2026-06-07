-- ============================================================================
-- 0178: Workflow run state for the generalized runtime (Constitution Art. 32)
-- ----------------------------------------------------------------------------
-- Connects the TS runtime to the SINGLE engine's run table (erp_workflow_instances)
-- additively. The legacy `status` enum + the one-active-per-record guard
-- (uq_wf_instance_active WHERE status='pending') are LEFT UNCHANGED — the adapter
-- keeps `status='pending'` while a run is active (running/waiting), so the guard
-- still holds, and records the precise runtime status in the new `runtime_state`.
-- Terminal runs map status → approved/rejected/cancelled (engine-compatible).
--
-- No existing column/constraint/RPC/index is modified. Additive + idempotent.
-- Depends on 0176/0177.
-- ============================================================================

ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS current_step_id UUID REFERENCES erp_workflow_steps(id) ON DELETE SET NULL;
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS attempts        INT NOT NULL DEFAULT 0;
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS last_error      TEXT;
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS next_action_at  TIMESTAMPTZ;     -- delay / retry / SLA wake time
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS runtime_state   TEXT;            -- running|waiting|completed|rejected|failed (precise)

-- FK covering index (schema-health invariant) + due-run selection index for the tick.
CREATE INDEX IF NOT EXISTS idx_erp_wf_inst_current_step ON erp_workflow_instances (current_step_id);
CREATE INDEX IF NOT EXISTS idx_erp_wf_inst_due          ON erp_workflow_instances (runtime_state, next_action_at);

-- Down (manual): drop the added columns + indexes.
