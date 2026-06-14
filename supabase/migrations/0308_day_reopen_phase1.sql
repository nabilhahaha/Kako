-- ============================================================================
-- 0308: FMCG Day Reopen — Phase 1 (governed request → approval → reopen)
-- ----------------------------------------------------------------------------
-- Replaces the bare super-admin-only reopen (a direct status flip with no
-- reason / approval / audit) with a GOVERNED workflow:
--   salesman requests a reopen WITH A REASON → Supervisor/Admin approves or
--   rejects → on approve the closed day re-opens. Every step is audited and the
--   reopen count is tracked. Flag-gated by platform.day_reopen (default OFF) and
--   permission-gated; the salesman can never self-approve.
--
-- Phase 1 only: lock_level is computed but the settlement / cash / accountant /
-- finalized tiers are inert (always 'none' here) — they land in Phase 2/3. The
-- request/decide RPCs follow the erp_close_day family (erp_user_has_perm,
-- tenant guard via the session's branch→company, erp_log_audit). Additive +
-- reversible; existing day-close behaviour is untouched.
-- ============================================================================

-- ── Reopen counters on the work session (additive) ───────────────────────────
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS last_reopened_at TIMESTAMPTZ;
ALTER TABLE erp_work_sessions ADD COLUMN IF NOT EXISTS last_reopened_by UUID;

-- ── Reopen requests (one governed request per reopen attempt) ────────────────
CREATE TABLE IF NOT EXISTS erp_day_reopen_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  work_session_id     UUID NOT NULL REFERENCES erp_work_sessions(id) ON DELETE CASCADE,
  requested_by        UUID NOT NULL,
  reason              TEXT NOT NULL,
  note                TEXT,
  lock_level          TEXT NOT NULL DEFAULT 'none'
                        CHECK (lock_level IN ('none','settlement_submitted','verified_cash_pending','cash_received','settlement_approved','finalized')),
  settlement_snapshot JSONB,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','cancelled','applied')),
  reopen_seq          INTEGER NOT NULL DEFAULT 1,
  decided_by          UUID,
  decided_at          TIMESTAMPTZ,
  decision_note       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_day_reopen_session ON erp_day_reopen_requests(work_session_id);
CREATE INDEX IF NOT EXISTS idx_erp_day_reopen_company ON erp_day_reopen_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_day_reopen_status ON erp_day_reopen_requests(company_id, status);
-- At most ONE pending request per session (prevents duplicate/race submits).
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_day_reopen_pending
  ON erp_day_reopen_requests(work_session_id) WHERE status = 'pending';

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_day_reopen_requests ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_day_reopen_set_company ON erp_day_reopen_requests';
  EXECUTE 'CREATE TRIGGER erp_day_reopen_set_company BEFORE INSERT ON erp_day_reopen_requests FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_day_reopen_read ON erp_day_reopen_requests';
  EXECUTE 'CREATE POLICY erp_day_reopen_read ON erp_day_reopen_requests FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_day_reopen_write ON erp_day_reopen_requests';
  EXECUTE 'CREATE POLICY erp_day_reopen_write ON erp_day_reopen_requests FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── Request a reopen (salesman) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_request_day_reopen(
  p_work_session_id uuid, p_reason text, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  ws        erp_work_sessions;
  v_co      uuid;
  v_newer   integer;
  v_req_id  uuid;
BEGIN
  IF NOT erp_user_has_perm('day.reopen.request') THEN
    RAISE EXCEPTION 'not authorized: day.reopen.request' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'a reason is required to request a reopen' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO ws FROM erp_work_sessions WHERE id = p_work_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'work session not found'; END IF;

  SELECT b.company_id INTO v_co FROM erp_branches b WHERE b.id = ws.branch_id;
  IF NOT erp_is_platform_owner() AND v_co IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant reopen denied' USING errcode = 'insufficient_privilege';
  END IF;

  -- The requester must own the day, and it must be CLOSED.
  IF NOT erp_is_platform_owner() AND ws.salesman_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'you can only request a reopen of your own day' USING errcode = 'insufficient_privilege';
  END IF;
  IF ws.status <> 'closed' THEN
    RAISE EXCEPTION 'only a closed day can be reopened' USING errcode = 'check_violation';
  END IF;

  -- Only the LATEST closed day is reopenable (no newer session for this salesman).
  SELECT count(*)::int INTO v_newer
    FROM erp_work_sessions w
   WHERE w.salesman_id = ws.salesman_id AND w.work_date > ws.work_date;
  IF v_newer > 0 THEN
    RAISE EXCEPTION 'only the latest closed day can be reopened' USING errcode = 'check_violation';
  END IF;

  -- One pending request at a time (also guarded by the unique index).
  IF EXISTS (SELECT 1 FROM erp_day_reopen_requests
              WHERE work_session_id = p_work_session_id AND status = 'pending') THEN
    RAISE EXCEPTION 'a reopen request is already pending for this day' USING errcode = 'unique_violation';
  END IF;

  INSERT INTO erp_day_reopen_requests
    (company_id, work_session_id, requested_by, reason, note, lock_level,
     settlement_snapshot, status, reopen_seq)
  VALUES
    (v_co, p_work_session_id, auth.uid(), trim(p_reason), NULLIF(trim(p_note), ''), 'none',
     jsonb_build_object('reopen_count', ws.reopen_count, 'close_status', ws.close_status),
     'pending', ws.reopen_count + 1)
  RETURNING id INTO v_req_id;

  PERFORM erp_log_audit('request_day_reopen', 'work_session', p_work_session_id::text,
    jsonb_build_object('request_id', v_req_id, 'reason', trim(p_reason),
      'reopen_seq', ws.reopen_count + 1, 'lock_level', 'none'), v_co);

  RETURN jsonb_build_object('request_id', v_req_id, 'status', 'pending',
    'work_session_id', p_work_session_id, 'reopen_seq', ws.reopen_count + 1);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_request_day_reopen(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_request_day_reopen(uuid, text, text) TO authenticated, service_role;

-- ── Decide a reopen request (supervisor / admin) ─────────────────────────────
CREATE OR REPLACE FUNCTION erp_decide_day_reopen(
  p_request_id uuid, p_decision text, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  req   erp_day_reopen_requests;
  ws    erp_work_sessions;
  v_co  uuid;
BEGIN
  IF NOT erp_user_has_perm('day.reopen.approve') THEN
    RAISE EXCEPTION 'not authorized: day.reopen.approve' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO req FROM erp_day_reopen_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reopen request not found'; END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'this request has already been decided' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO ws FROM erp_work_sessions WHERE id = req.work_session_id;
  SELECT b.company_id INTO v_co FROM erp_branches b WHERE b.id = ws.branch_id;
  IF NOT erp_is_platform_owner() AND v_co IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant decision denied' USING errcode = 'insufficient_privilege';
  END IF;

  -- Salesman can never approve their own reopen.
  IF req.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'you cannot decide your own reopen request' USING errcode = 'insufficient_privilege';
  END IF;

  IF p_decision = 'approve' THEN
    -- Re-open the day (single governed path) + bump the reopen counter.
    UPDATE erp_work_sessions SET
      status = 'open', close_status = 'open', closed_at = NULL,
      reopen_count = reopen_count + 1, last_reopened_at = now(), last_reopened_by = auth.uid()
    WHERE id = req.work_session_id;

    UPDATE erp_day_reopen_requests SET
      status = 'applied', decided_by = auth.uid(), decided_at = now(),
      decision_note = NULLIF(trim(p_note), '')
    WHERE id = p_request_id;

    PERFORM erp_log_audit('approve_day_reopen', 'work_session', req.work_session_id::text,
      jsonb_build_object('request_id', p_request_id, 'reopen_count', ws.reopen_count + 1,
        'lock_level', req.lock_level), v_co);

    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'applied',
      'work_session_id', req.work_session_id, 'reopen_count', ws.reopen_count + 1);
  ELSE
    UPDATE erp_day_reopen_requests SET
      status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      decision_note = NULLIF(trim(p_note), '')
    WHERE id = p_request_id;

    PERFORM erp_log_audit('reject_day_reopen', 'work_session', req.work_session_id::text,
      jsonb_build_object('request_id', p_request_id), v_co);

    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'rejected',
      'work_session_id', req.work_session_id);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_decide_day_reopen(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_decide_day_reopen(uuid, text, text) TO authenticated, service_role;

-- ── Default role permissions (TEMPLATE — new companies inherit these) ────────
-- Salesman may REQUEST; supervisor/manager/branch_manager/admin may APPROVE.
-- Existing companies with their own erp_company_role_permissions config are
-- unaffected (they adopt via an explicit, documented grant). Flag-gated, so the
-- capability is inert until platform.day_reopen is enabled for a company.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('salesman',       'day.reopen.request'),
  ('supervisor',     'day.reopen.approve'),
  ('manager',        'day.reopen.approve'),
  ('branch_manager', 'day.reopen.approve'),
  ('admin',          'day.reopen.approve')
ON CONFLICT (role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_decide_day_reopen(uuid, text, text);
-- DROP FUNCTION IF EXISTS erp_request_day_reopen(uuid, text, text);
-- DROP TABLE IF EXISTS erp_day_reopen_requests;
-- ALTER TABLE erp_work_sessions DROP COLUMN IF EXISTS reopen_count, DROP COLUMN IF EXISTS last_reopened_at, DROP COLUMN IF EXISTS last_reopened_by;
-- DELETE FROM erp_role_permissions WHERE permission IN ('day.reopen.request','day.reopen.approve');
