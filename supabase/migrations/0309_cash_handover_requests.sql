-- ============================================================================
-- 0309: Salesman cash-handover request (Requests Hub, Phase 1)
-- ----------------------------------------------------------------------------
-- A lightweight, governed request: the salesman declares an amount of cash he is
-- handing over to the office/cashier; a cashier/supervisor CONFIRMS (received) or
-- rejects it. Reason/amount required, audited, no self-confirm — the same shape
-- as the day-reopen request (0308). This is the request layer; the fuller cash
-- custody (per-day liability + multi-day allocation) is a later workstream and
-- will reference these confirmations. Flag-gated (platform.salesman_requests).
-- Additive + reversible; no transaction/accounting change.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_cash_handover_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  salesman_id    UUID NOT NULL,
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','rejected','cancelled')),
  decided_by     UUID,
  decided_at     TIMESTAMPTZ,
  decision_note  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_cash_handover_company ON erp_cash_handover_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_cash_handover_salesman ON erp_cash_handover_requests(salesman_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_cash_handover_requests ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_cash_handover_set_company ON erp_cash_handover_requests';
  EXECUTE 'CREATE TRIGGER erp_cash_handover_set_company BEFORE INSERT ON erp_cash_handover_requests FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_cash_handover_read ON erp_cash_handover_requests';
  EXECUTE 'CREATE POLICY erp_cash_handover_read ON erp_cash_handover_requests FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_cash_handover_write ON erp_cash_handover_requests';
  EXECUTE 'CREATE POLICY erp_cash_handover_write ON erp_cash_handover_requests FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── Request a cash handover (salesman) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_request_cash_handover(p_amount numeric, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid; v_id uuid;
BEGIN
  IF NOT erp_user_has_perm('cash.handover.request') THEN
    RAISE EXCEPTION 'not authorized: cash.handover.request' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero' USING errcode = 'check_violation';
  END IF;
  v_co := erp_user_company_id();
  IF v_co IS NULL THEN RAISE EXCEPTION 'no company'; END IF;

  INSERT INTO erp_cash_handover_requests (company_id, salesman_id, amount, note, status)
  VALUES (v_co, auth.uid(), round(p_amount, 2), NULLIF(trim(p_note), ''), 'pending')
  RETURNING id INTO v_id;

  PERFORM erp_log_audit('request_cash_handover', 'cash_handover_request', v_id::text,
    jsonb_build_object('amount', round(p_amount, 2)), v_co);
  RETURN jsonb_build_object('request_id', v_id, 'status', 'pending', 'amount', round(p_amount, 2));
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_request_cash_handover(numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_request_cash_handover(numeric, text) TO authenticated, service_role;

-- ── Decide a cash handover (cashier / supervisor) ────────────────────────────
CREATE OR REPLACE FUNCTION erp_decide_cash_handover(p_request_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE req erp_cash_handover_requests; v_co uuid; v_new text;
BEGIN
  IF NOT erp_user_has_perm('cash.handover.confirm') THEN
    RAISE EXCEPTION 'not authorized: cash.handover.confirm' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_decision NOT IN ('confirm','reject') THEN
    RAISE EXCEPTION 'decision must be confirm or reject' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO req FROM erp_cash_handover_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'this request has already been decided' USING errcode = 'check_violation';
  END IF;
  v_co := req.company_id;
  IF NOT erp_is_platform_owner() AND v_co IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant decision denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF req.salesman_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot confirm your own handover' USING errcode = 'insufficient_privilege';
  END IF;

  v_new := CASE WHEN p_decision = 'confirm' THEN 'confirmed' ELSE 'rejected' END;
  UPDATE erp_cash_handover_requests SET
    status = v_new, decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(trim(p_note), '')
  WHERE id = p_request_id;

  PERFORM erp_log_audit(
    CASE WHEN p_decision = 'confirm' THEN 'confirm_cash_handover' ELSE 'reject_cash_handover' END,
    'cash_handover_request', p_request_id::text, jsonb_build_object('amount', req.amount), v_co);
  RETURN jsonb_build_object('request_id', p_request_id, 'status', v_new);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_decide_cash_handover(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_decide_cash_handover(uuid, text, text) TO authenticated, service_role;

-- ── Default role permissions (TEMPLATE — new companies inherit) ──────────────
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('salesman',       'cash.handover.request'),
  ('cashier',        'cash.handover.confirm'),
  ('supervisor',     'cash.handover.confirm'),
  ('manager',        'cash.handover.confirm'),
  ('branch_manager', 'cash.handover.confirm'),
  ('accountant',     'cash.handover.confirm'),
  ('admin',          'cash.handover.confirm')
ON CONFLICT (role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_decide_cash_handover(uuid, text, text);
-- DROP FUNCTION IF EXISTS erp_request_cash_handover(numeric, text);
-- DROP TABLE IF EXISTS erp_cash_handover_requests;
-- DELETE FROM erp_role_permissions WHERE permission IN ('cash.handover.request','cash.handover.confirm');
