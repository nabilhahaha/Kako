-- ============================================================================
-- 0310: Governed customer requests (Requests Hub, Phase 2)
-- ----------------------------------------------------------------------------
-- ONE generic governed-request table for the salesman's customer requests:
--   new_customer | data_update | gps_correction.
-- Same shape as the cash-handover/reopen requests (request → decide → audit).
-- The salesman NEVER writes master data directly: the change is APPLIED
-- server-side ONLY on approval, by the approver, inside erp_decide_customer_request.
-- Flag-gated (platform.salesman_requests). Additive + reversible.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_customer_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  salesman_id       UUID NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('new_customer','data_update','gps_correction')),
  customer_id       UUID REFERENCES erp_customers(id) ON DELETE SET NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','applied','cancelled')),
  applied_record_id UUID,
  decided_by        UUID,
  decided_at        TIMESTAMPTZ,
  decision_note     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_customer_requests_company ON erp_customer_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_customer_requests_salesman ON erp_customer_requests(salesman_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_customer_requests ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_customer_requests_set_company ON erp_customer_requests';
  EXECUTE 'CREATE TRIGGER erp_customer_requests_set_company BEFORE INSERT ON erp_customer_requests FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_customer_requests_read ON erp_customer_requests';
  EXECUTE 'CREATE POLICY erp_customer_requests_read ON erp_customer_requests FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_customer_requests_write ON erp_customer_requests';
  EXECUTE 'CREATE POLICY erp_customer_requests_write ON erp_customer_requests FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── Raise a customer request (salesman) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_request_customer_change(p_kind text, p_customer_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid; v_id uuid; v_cust_co uuid;
BEGIN
  IF NOT erp_user_has_perm('customer.request') THEN
    RAISE EXCEPTION 'not authorized: customer.request' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_kind NOT IN ('new_customer','data_update','gps_correction') THEN
    RAISE EXCEPTION 'invalid request kind' USING errcode = 'check_violation';
  END IF;
  v_co := erp_user_company_id();
  IF v_co IS NULL THEN RAISE EXCEPTION 'no company'; END IF;

  IF p_kind = 'new_customer' THEN
    IF COALESCE(trim(p_payload->>'name'), '') = '' THEN
      RAISE EXCEPTION 'customer name is required' USING errcode = 'check_violation';
    END IF;
  ELSE
    IF p_customer_id IS NULL THEN RAISE EXCEPTION 'a customer is required' USING errcode = 'check_violation'; END IF;
    SELECT company_id INTO v_cust_co FROM erp_customers WHERE id = p_customer_id;
    IF v_cust_co IS DISTINCT FROM v_co THEN RAISE EXCEPTION 'customer not found' USING errcode = 'check_violation'; END IF;
    IF p_kind = 'data_update' AND (p_payload->>'field') NOT IN
       ('name','name_ar','phone','city','address','cr_number','tax_number','credit_limit','payment_terms_days') THEN
      RAISE EXCEPTION 'field is not editable by request' USING errcode = 'check_violation';
    END IF;
  END IF;

  INSERT INTO erp_customer_requests (company_id, salesman_id, kind, customer_id, payload, status)
  VALUES (v_co, auth.uid(), p_kind, p_customer_id, COALESCE(p_payload, '{}'::jsonb), 'pending')
  RETURNING id INTO v_id;

  PERFORM erp_log_audit('request_customer_change', 'customer_request', v_id::text,
    jsonb_build_object('kind', p_kind, 'customer_id', p_customer_id), v_co);
  RETURN jsonb_build_object('request_id', v_id, 'status', 'pending');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_request_customer_change(text, uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_request_customer_change(text, uuid, jsonb) TO authenticated, service_role;

-- ── Decide + APPLY a customer request (approver) ─────────────────────────────
CREATE OR REPLACE FUNCTION erp_decide_customer_request(p_request_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  req       erp_customer_requests;
  v_co      uuid;
  p         jsonb;
  v_field   text;
  v_new     text;
  v_applied uuid;
  v_code    text;
BEGIN
  IF NOT erp_user_has_perm('customer.request.approve') THEN
    RAISE EXCEPTION 'not authorized: customer.request.approve' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO req FROM erp_customer_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'this request has already been decided' USING errcode = 'check_violation'; END IF;
  v_co := req.company_id;
  IF NOT erp_is_platform_owner() AND v_co IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant decision denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF req.salesman_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot decide your own request' USING errcode = 'insufficient_privilege';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE erp_customer_requests SET status='rejected', decided_by=auth.uid(), decided_at=now(), decision_note=NULLIF(trim(p_note),'') WHERE id=p_request_id;
    PERFORM erp_log_audit('reject_customer_request', 'customer_request', p_request_id::text, jsonb_build_object('kind', req.kind), v_co);
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'rejected');
  END IF;

  -- APPROVE → apply the master-data change (server-side, by the approver).
  p := req.payload;
  IF req.kind = 'new_customer' THEN
    v_code := 'C' || to_char(now() AT TIME ZONE 'utc', 'YYMMDD') || upper(substr(md5(random()::text), 1, 5));
    INSERT INTO erp_customers (company_id, branch_id, salesman_id, code, name, name_ar, phone, city, address,
       latitude, longitude, cr_number, tax_number, is_vat_registered,
       is_approved, approval_status, created_source)
    VALUES (v_co, NULLIF(p->>'branch_id','')::uuid, req.salesman_id, v_code,
       trim(p->>'name'), COALESCE(NULLIF(trim(p->>'name_ar'),''), trim(p->>'name')),
       NULLIF(p->>'mobile',''), NULLIF(p->>'city',''), NULLIF(p->>'address',''),
       NULLIF(p->>'latitude','')::numeric, NULLIF(p->>'longitude','')::numeric,
       NULLIF(p->>'cr',''), NULLIF(p->>'vat',''), (NULLIF(p->>'vat','') IS NOT NULL),
       true, 'approved', 'manual')
    RETURNING id INTO v_applied;

  ELSIF req.kind = 'gps_correction' THEN
    UPDATE erp_customers SET latitude = (p->>'new_lat')::numeric, longitude = (p->>'new_lng')::numeric, updated_at = now()
    WHERE id = req.customer_id;
    v_applied := req.customer_id;

  ELSIF req.kind = 'data_update' THEN
    v_field := p->>'field';
    v_new := p->>'new_value';
    IF v_field = 'credit_limit' THEN
      EXECUTE 'UPDATE erp_customers SET credit_limit=$1, updated_at=now() WHERE id=$2' USING NULLIF(v_new,'')::numeric, req.customer_id;
    ELSIF v_field = 'payment_terms_days' THEN
      EXECUTE 'UPDATE erp_customers SET payment_terms_days=$1, updated_at=now() WHERE id=$2' USING NULLIF(v_new,'')::int, req.customer_id;
    ELSIF v_field IN ('name','name_ar','phone','city','address','cr_number','tax_number') THEN
      EXECUTE format('UPDATE erp_customers SET %I=$1, updated_at=now() WHERE id=$2', v_field) USING NULLIF(v_new,''), req.customer_id;
    ELSE
      RAISE EXCEPTION 'field is not editable by request' USING errcode = 'check_violation';
    END IF;
    v_applied := req.customer_id;
  END IF;

  UPDATE erp_customer_requests SET status='applied', applied_record_id=v_applied,
    decided_by=auth.uid(), decided_at=now(), decision_note=NULLIF(trim(p_note),'')
  WHERE id = p_request_id;

  PERFORM erp_log_audit('apply_customer_request', 'customer_request', p_request_id::text,
    jsonb_build_object('kind', req.kind, 'customer_id', v_applied), v_co);
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'applied', 'customer_id', v_applied);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_decide_customer_request(uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_decide_customer_request(uuid, text, text) TO authenticated, service_role;

-- ── Default role permissions (TEMPLATE) ──────────────────────────────────────
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('salesman',       'customer.request'),
  ('supervisor',     'customer.request.approve'),
  ('manager',        'customer.request.approve'),
  ('branch_manager', 'customer.request.approve'),
  ('admin',          'customer.request.approve')
ON CONFLICT (role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_decide_customer_request(uuid, text, text);
-- DROP FUNCTION IF EXISTS erp_request_customer_change(text, uuid, jsonb);
-- DROP TABLE IF EXISTS erp_customer_requests;
-- DELETE FROM erp_role_permissions WHERE permission IN ('customer.request','customer.request.approve');
