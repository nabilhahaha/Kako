-- ============================================================================
-- 0141: Value Acceleration Wave 1 — Credit-limit request extension
-- ----------------------------------------------------------------------------
-- REUSES the existing erp_credit_limit_requests table (0089) — does NOT recreate
-- it. Adds decision/expiry fields, plus two perm-guarded RPCs to request and
-- decide credit-limit changes. Approving updates the customer's credit_limit.
-- Pairs naturally with the GLOBAL 'credit_limit_approval' workflow seeded in 0089.
-- ADDITIVE only; idempotent.
--
-- RPCs self-guard on perm (erp_user_has_perm) + tenant scope; SECURITY DEFINER,
-- locked down; audited. erp_credit_limit_requests is company-scoped directly;
-- erp_customers is branch-scoped (company via erp_branches).
-- ============================================================================

ALTER TABLE erp_credit_limit_requests ADD COLUMN IF NOT EXISTS approver_role   TEXT;
ALTER TABLE erp_credit_limit_requests ADD COLUMN IF NOT EXISTS approved_amount NUMERIC(14,2);
ALTER TABLE erp_credit_limit_requests ADD COLUMN IF NOT EXISTS expiry_date     DATE;
ALTER TABLE erp_credit_limit_requests ADD COLUMN IF NOT EXISTS decided_by      UUID;
ALTER TABLE erp_credit_limit_requests ADD COLUMN IF NOT EXISTS decided_at      TIMESTAMPTZ;
ALTER TABLE erp_credit_limit_requests ADD COLUMN IF NOT EXISTS reason          TEXT;

-- ── Request a credit-limit change (status 'pending') ─────────────────────────
CREATE OR REPLACE FUNCTION erp_request_credit_limit(
  p_customer_id uuid, p_requested_limit numeric, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co  uuid := erp_user_company_id();
  c     RECORD;
  v_id  uuid;
BEGIN
  IF NOT erp_user_has_perm('credit.request.create') THEN
    RAISE EXCEPTION 'not authorized: credit.request.create' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT cu.*, b.company_id AS branch_company INTO c
    FROM erp_customers cu LEFT JOIN erp_branches b ON b.id = cu.branch_id
   WHERE cu.id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF NOT erp_is_platform_owner() AND c.branch_company IS DISTINCT FROM v_co THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  v_co := COALESCE(v_co, c.branch_company);

  INSERT INTO erp_credit_limit_requests(
    company_id, customer_id, current_limit, requested_limit, status, reason, created_by)
  VALUES (v_co, p_customer_id, c.credit_limit, p_requested_limit, 'pending', p_reason, auth.uid())
  RETURNING id INTO v_id;

  PERFORM erp_log_audit('request', 'credit_limit_request', v_id::text,
    jsonb_build_object('customer_id', p_customer_id, 'current_limit', c.credit_limit,
      'requested_limit', p_requested_limit), v_co);

  RETURN jsonb_build_object('request_id', v_id, 'status', 'pending');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_request_credit_limit(uuid, numeric, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_request_credit_limit(uuid, numeric, text) TO authenticated, service_role;

-- ── Decide a credit-limit request (approve applies the new limit) ────────────
CREATE OR REPLACE FUNCTION erp_decide_credit_limit(
  p_id uuid, p_approve boolean, p_approved_amount numeric DEFAULT NULL,
  p_expiry date DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_r       erp_credit_limit_requests;
  v_amount  numeric;
  v_status  text;
BEGIN
  IF NOT erp_user_has_perm('credit.request.approve') THEN
    RAISE EXCEPTION 'not authorized: credit.request.approve' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM erp_credit_limit_requests WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_r.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_r.status <> 'pending' THEN RAISE EXCEPTION 'request not pending'; END IF;

  IF p_approve THEN
    v_amount := COALESCE(p_approved_amount, v_r.requested_limit);
    v_status := 'approved';
    UPDATE erp_credit_limit_requests
       SET status = 'approved', decided_by = auth.uid(), decided_at = now(),
           approved_amount = v_amount, expiry_date = p_expiry,
           reason = COALESCE(p_note, reason)
     WHERE id = p_id;
    UPDATE erp_customers SET credit_limit = v_amount WHERE id = v_r.customer_id;
  ELSE
    v_status := 'rejected';
    UPDATE erp_credit_limit_requests
       SET status = 'rejected', decided_by = auth.uid(), decided_at = now(),
           reason = COALESCE(p_note, reason)
     WHERE id = p_id;
  END IF;

  PERFORM erp_log_audit('decide', 'credit_limit_request', p_id::text,
    jsonb_build_object('approve', p_approve, 'approved_amount', v_amount,
      'expiry', p_expiry, 'customer_id', v_r.customer_id), v_r.company_id);

  RETURN jsonb_build_object('request_id', p_id, 'status', v_status, 'approved_amount', v_amount);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_decide_credit_limit(uuid, boolean, numeric, date, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_decide_credit_limit(uuid, boolean, numeric, date, text) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_decide_credit_limit(uuid, boolean, numeric, date, text);
-- DROP FUNCTION IF EXISTS erp_request_credit_limit(uuid, numeric, text);
-- ALTER TABLE erp_credit_limit_requests
--   DROP COLUMN IF EXISTS reason, DROP COLUMN IF EXISTS decided_at,
--   DROP COLUMN IF EXISTS decided_by, DROP COLUMN IF EXISTS expiry_date,
--   DROP COLUMN IF EXISTS approved_amount, DROP COLUMN IF EXISTS approver_role;
