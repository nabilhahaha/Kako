-- ============================================================================
-- 0179: Workflow Phase A — runtime approval resume + api_call egress allow-list
-- ----------------------------------------------------------------------------
-- Additive. Does NOT modify the existing engine RPCs.
--   1. erp_workflow_decide_runtime — decide an approval task for a RUNTIME-OWNED
--      run (runtime_state set): authorize + mark the task, but DO NOT advance the
--      instance (the TS runtime owns advancement; the caller then runs resumeRun).
--      Legacy approval workflows keep using erp_workflow_decide unchanged.
--   2. erp_workflow_egress_rules — per-company allow-list of approved domains +
--      connectors for the api_call executor (approved connectors + domains only,
--      tenant-isolated, audited).
-- Depends on 0088 (engine + erp_is_company_admin/erp_log_audit) and 0178.
-- ============================================================================

-- 1. Runtime-owned approval decision (mark only; no advance).
CREATE OR REPLACE FUNCTION erp_workflow_decide_runtime(
  p_task_id uuid, p_decision text, p_comment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_task erp_workflow_tasks;
  v_inst erp_workflow_instances;
BEGIN
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'invalid decision'; END IF;
  SELECT * INTO v_task FROM erp_workflow_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL OR v_task.status <> 'pending' THEN RAISE EXCEPTION 'task not actionable'; END IF;
  SELECT * INTO v_inst FROM erp_workflow_instances WHERE id = v_task.instance_id;
  IF v_inst.runtime_state IS NULL THEN
    RAISE EXCEPTION 'not a runtime-owned run (use erp_workflow_decide)';
  END IF;
  -- Same authorization as erp_workflow_decide.
  IF NOT (
    (v_task.assignee_type = 'company_admin' AND erp_is_company_admin(v_inst.company_id))
    OR (v_task.assignee_type = 'user' AND v_task.assignee_ref = auth.uid()::text)
    OR erp_is_platform_owner()
  ) THEN
    RAISE EXCEPTION 'not authorized to decide this task';
  END IF;
  UPDATE erp_workflow_tasks
     SET status = CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(), decided_at = now(), comment = p_comment
   WHERE id = p_task_id;
  PERFORM erp_log_audit('decide_runtime','workflow_task', p_task_id::text,
    jsonb_build_object('decision', p_decision, 'instance', v_inst.id), v_inst.company_id);
  RETURN jsonb_build_object('ok', true, 'instance_id', v_inst.id, 'decision', p_decision);
END; $$;
REVOKE ALL ON FUNCTION erp_workflow_decide_runtime(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION erp_workflow_decide_runtime(uuid,text,text) TO authenticated;

-- 2. api_call egress allow-list (approved domains + connectors, per company).
CREATE TABLE IF NOT EXISTS erp_workflow_egress_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  domain        text NOT NULL,            -- exact host ('api.x.com') or suffix ('.x.com')
  connector_key text,                      -- NULL = any connector; else must match the step's connector
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, domain)              -- (company_id, …) also covers the FK index
);
ALTER TABLE erp_workflow_egress_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_wf_egress_tenant ON erp_workflow_egress_rules;
CREATE POLICY erp_wf_egress_tenant ON erp_workflow_egress_rules FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
DROP TRIGGER IF EXISTS erp_wf_egress_set_company ON erp_workflow_egress_rules;
CREATE TRIGGER erp_wf_egress_set_company BEFORE INSERT ON erp_workflow_egress_rules
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_wf_egress_updated ON erp_workflow_egress_rules;
CREATE TRIGGER erp_wf_egress_updated BEFORE UPDATE ON erp_workflow_egress_rules
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- Down (manual): drop function erp_workflow_decide_runtime; drop table erp_workflow_egress_rules.
