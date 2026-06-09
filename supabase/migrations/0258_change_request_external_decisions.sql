-- ============================================================================
-- 0258: Change Request engine — Phase 8: external approval decisions (inbound)
-- ----------------------------------------------------------------------------
-- A tenant-scoped record of approval decisions received from EXTERNAL systems
-- (email / ERP / government / API) via the signed callback seam
-- (POST /api/internal/change-requests/approvals/callback). The callback verifies
-- an HMAC signature, then records the verified decision here (service role).
-- Operators read it RLS-scoped to their company. Wiring a recorded decision into
-- the workflow engine (erp_workflow_decide) is the fast-follow once the engine
-- gains an external-principal mode; this phase ships the verified intake + record.
-- Additive; INERT until KAKO_CHANGE_REQUESTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_change_request_external_decisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL,
  instance_id  uuid,
  request_id   uuid,
  decision     text NOT NULL CHECK (decision IN ('approve', 'reject')),
  adapter      text NOT NULL,
  comment      text,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_ext_decisions_company ON erp_change_request_external_decisions (company_id);
CREATE INDEX IF NOT EXISTS idx_cr_ext_decisions_task ON erp_change_request_external_decisions (task_id);
ALTER TABLE erp_change_request_external_decisions ENABLE ROW LEVEL SECURITY;

-- Operators read their company's external decisions. Inserts come from the service
-- role (the callback route), which bypasses RLS; no tenant insert/update path.
DROP POLICY IF EXISTS erp_cr_ext_decisions_read ON erp_change_request_external_decisions;
CREATE POLICY erp_cr_ext_decisions_read ON erp_change_request_external_decisions FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Rollback (manual): DROP TABLE IF EXISTS erp_change_request_external_decisions; ──
