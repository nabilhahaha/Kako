-- ============================================================================
-- 0183: Workflow Platform V1.1 — C3 effect-idempotency ledger
-- ----------------------------------------------------------------------------
-- Additive. Records one row per (instance, step, attempt) so side-effecting steps
-- (notification/task/update_record/api_call/escalation) fire effectively-once,
-- making the C1 at-least-once sweep + C2 reclaim safe. The runtime consults this
-- via an optional ledger dep — no new engine, no new runtime. Gated OFF by default
-- (KAKO_WF_IDEMPOTENT); unused when off. Depends on 0088 + 0176/0177.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_workflow_step_effects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES erp_companies(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES erp_workflow_instances(id) ON DELETE CASCADE,
  step_id     uuid NOT NULL REFERENCES erp_workflow_steps(id) ON DELETE CASCADE,
  attempt     int  NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'pending',           -- 'pending' (claimed) | 'done'
  result      jsonb,                                      -- the settled StepResult
  created_at  timestamptz NOT NULL DEFAULT now(),
  settled_at  timestamptz,
  CONSTRAINT erp_wf_step_effects_status_chk CHECK (status IN ('pending','done')),
  -- The claim key: one effect row per (instance, step, attempt). Also covers the
  -- instance_id FK (leading column).
  CONSTRAINT uq_erp_wf_step_effects UNIQUE (instance_id, step_id, attempt)
);

-- Covering indexes for the remaining FKs (schema-health invariant).
CREATE INDEX IF NOT EXISTS idx_erp_wf_step_effects_step    ON erp_workflow_step_effects (step_id);
CREATE INDEX IF NOT EXISTS idx_erp_wf_step_effects_company ON erp_workflow_step_effects (company_id);

ALTER TABLE erp_workflow_step_effects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_wf_step_effects_tenant ON erp_workflow_step_effects;
CREATE POLICY erp_wf_step_effects_tenant ON erp_workflow_step_effects FOR ALL
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Down (manual): drop table erp_workflow_step_effects.
