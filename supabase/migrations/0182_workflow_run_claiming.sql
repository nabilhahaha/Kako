-- ============================================================================
-- 0182: Workflow Platform V1.1 — C2 single-flight due-run claiming
-- ----------------------------------------------------------------------------
-- Additive. Adds a lease/claim to erp_workflow_instances so overlapping ticks
-- (or future parallel workers) never process the same run twice. Reuses the
-- single engine/runtime — no new engine, no new runtime. Gated OFF by default
-- (KAKO_WF_CLAIM); when the flag is off these columns/function are simply unused.
-- Depends on 0088 + 0178 (runtime_state / next_action_at).
-- ============================================================================

ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS claimed_at        timestamptz;
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS claim_expires_at  timestamptz;
ALTER TABLE erp_workflow_instances ADD COLUMN IF NOT EXISTS claimed_by        text;

-- Partial index: the claim scan only ever looks at waiting runs with a wake time.
CREATE INDEX IF NOT EXISTS idx_erp_wf_inst_claimable
  ON erp_workflow_instances (next_action_at)
  WHERE runtime_state = 'waiting' AND next_action_at IS NOT NULL;

-- Atomically claim up to p_limit due runs (waiting + wake time passed) that are
-- unclaimed OR whose lease has expired. FOR UPDATE SKIP LOCKED guarantees two
-- concurrent callers get disjoint sets. SECURITY DEFINER so the service-role
-- tick can claim across tenants; the caller still impersonates per-run for the
-- actual advance (RLS preserved there).
CREATE OR REPLACE FUNCTION erp_workflow_claim_due_runs(p_limit int, p_lease_seconds int, p_worker text DEFAULT NULL)
RETURNS TABLE (id uuid, started_by uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT i.id
    FROM erp_workflow_instances i
    WHERE i.runtime_state = 'waiting'
      AND i.next_action_at IS NOT NULL
      AND i.next_action_at <= now()
      AND (i.claim_expires_at IS NULL OR i.claim_expires_at <= now())
    ORDER BY i.next_action_at ASC
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE erp_workflow_instances i
     SET claimed_at = now(),
         claim_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
         claimed_by = p_worker
    FROM due
   WHERE i.id = due.id
  RETURNING i.id, i.started_by;
END;
$$;

REVOKE ALL ON FUNCTION erp_workflow_claim_due_runs(int, int, text) FROM PUBLIC;

-- Down (manual): drop the function, idx_erp_wf_inst_claimable, and the three columns.
