-- ============================================================================
-- 0312: Customer governance requests — route transfer, reactivation, closure
-- ----------------------------------------------------------------------------
-- Completes the Requests-Hub customer catalog on the SAME governed model (0310/
-- 0311): request → decide → apply-on-approval → audit. Adds 3 kinds:
--   route_transfer  → re-assigns the customer's route (+ salesman)
--   reactivate      → is_active=true, customer_status='active'
--   close           → is_active=false, customer_status='closed'
-- (credit_limit / payment_terms already exist.) No direct master-data writes by
-- salesmen; applied only on approval. Additive + reversible.
-- ============================================================================

ALTER TABLE erp_customer_requests DROP CONSTRAINT IF EXISTS erp_customer_requests_kind_check;
ALTER TABLE erp_customer_requests ADD CONSTRAINT erp_customer_requests_kind_check
  CHECK (kind IN ('new_customer','data_update','gps_correction','credit_limit','payment_terms',
                  'route_transfer','reactivate','close'));

CREATE OR REPLACE FUNCTION erp_request_customer_change(p_kind text, p_customer_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid; v_id uuid; v_cust_co uuid; p jsonb;
BEGIN
  IF NOT erp_user_has_perm('customer.request') THEN
    RAISE EXCEPTION 'not authorized: customer.request' USING errcode='insufficient_privilege';
  END IF;
  IF p_kind NOT IN ('new_customer','data_update','gps_correction','credit_limit','payment_terms','route_transfer','reactivate','close') THEN
    RAISE EXCEPTION 'invalid request kind' USING errcode='check_violation';
  END IF;
  v_co := erp_user_company_id();
  IF v_co IS NULL THEN RAISE EXCEPTION 'no company'; END IF;
  p := COALESCE(p_payload, '{}'::jsonb);

  IF p_kind = 'new_customer' THEN
    IF COALESCE(trim(p->>'name'),'')   = '' THEN RAISE EXCEPTION 'customer name is required' USING errcode='check_violation'; END IF;
    IF COALESCE(trim(p->>'mobile'),'') = '' THEN RAISE EXCEPTION 'mobile number is required' USING errcode='check_violation'; END IF;
    IF COALESCE(trim(p->>'owner'),'')  = '' THEN RAISE EXCEPTION 'owner name is required' USING errcode='check_violation'; END IF;
    IF COALESCE(trim(p->>'activity'),'')='' THEN RAISE EXCEPTION 'activity type is required' USING errcode='check_violation'; END IF;
    IF COALESCE(trim(p->>'city'),'')   = '' THEN RAISE EXCEPTION 'city is required' USING errcode='check_violation'; END IF;
    IF COALESCE(trim(p->>'district'),'')='' THEN RAISE EXCEPTION 'district is required' USING errcode='check_violation'; END IF;
    IF NULLIF(p->>'latitude','') IS NULL OR NULLIF(p->>'longitude','') IS NULL THEN
      RAISE EXCEPTION 'GPS location is required' USING errcode='check_violation';
    END IF;
  ELSE
    IF p_customer_id IS NULL THEN RAISE EXCEPTION 'a customer is required' USING errcode='check_violation'; END IF;
    SELECT company_id INTO v_cust_co FROM erp_customers WHERE id = p_customer_id;
    IF v_cust_co IS DISTINCT FROM v_co THEN RAISE EXCEPTION 'customer not found' USING errcode='check_violation'; END IF;
    IF p_kind = 'data_update' AND (p->>'field') NOT IN
       ('name','name_ar','phone','city','address','cr_number','tax_number','national_address','contact_person','credit_limit','payment_terms_days') THEN
      RAISE EXCEPTION 'field is not editable by request' USING errcode='check_violation';
    END IF;
    IF p_kind = 'credit_limit'   AND NULLIF(p->>'new_limit','') IS NULL THEN RAISE EXCEPTION 'a requested credit limit is required' USING errcode='check_violation'; END IF;
    IF p_kind = 'payment_terms'  AND NULLIF(p->>'new_terms','') IS NULL THEN RAISE EXCEPTION 'requested payment terms are required' USING errcode='check_violation'; END IF;
    IF p_kind = 'route_transfer' AND NULLIF(p->>'req_route','') IS NULL AND NULLIF(p->>'req_salesman','') IS NULL THEN
      RAISE EXCEPTION 'a requested route or salesman is required' USING errcode='check_violation';
    END IF;
    IF p_kind = 'reactivate' AND COALESCE(trim(p->>'reason'),'') = '' THEN RAISE EXCEPTION 'reactivation reason is required' USING errcode='check_violation'; END IF;
    IF p_kind = 'close'      AND COALESCE(trim(p->>'closure_reason'),'') = '' THEN RAISE EXCEPTION 'closure reason is required' USING errcode='check_violation'; END IF;
  END IF;

  INSERT INTO erp_customer_requests (company_id, salesman_id, kind, customer_id, payload, status)
  VALUES (v_co, auth.uid(), p_kind, p_customer_id, p, 'pending')
  RETURNING id INTO v_id;

  PERFORM erp_log_audit('request_customer_change', 'customer_request', v_id::text,
    jsonb_build_object('kind', p_kind, 'customer_id', p_customer_id), v_co);
  RETURN jsonb_build_object('request_id', v_id, 'status', 'pending');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_request_customer_change(text, uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_request_customer_change(text, uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION erp_decide_customer_request(p_request_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  req erp_customer_requests; v_co uuid; p jsonb; v_field text; v_new text; v_applied uuid; v_code text; v_custom jsonb;
BEGIN
  IF NOT erp_user_has_perm('customer.request.approve') THEN
    RAISE EXCEPTION 'not authorized: customer.request.approve' USING errcode='insufficient_privilege';
  END IF;
  IF p_decision NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject' USING errcode='check_violation';
  END IF;

  SELECT * INTO req FROM erp_customer_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'this request has already been decided' USING errcode='check_violation'; END IF;
  v_co := req.company_id;
  IF NOT erp_is_platform_owner() AND v_co IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant decision denied' USING errcode='insufficient_privilege';
  END IF;
  IF req.salesman_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot decide your own request' USING errcode='insufficient_privilege';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE erp_customer_requests SET status='rejected', decided_by=auth.uid(), decided_at=now(), decision_note=NULLIF(trim(p_note),'') WHERE id=p_request_id;
    PERFORM erp_log_audit('reject_customer_request', 'customer_request', p_request_id::text, jsonb_build_object('kind', req.kind), v_co);
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'rejected');
  END IF;

  p := req.payload;
  IF req.kind = 'new_customer' THEN
    IF NOT EXISTS (SELECT 1 FROM erp_attachments WHERE entity='customer_request' AND record_id=p_request_id::text AND doc_type='storefront' AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'a storefront photo is required before approval' USING errcode='check_violation';
    END IF;
    v_custom := jsonb_strip_nulls(jsonb_build_object(
      'district', NULLIF(p->>'district',''), 'activity', NULLIF(p->>'activity',''),
      'classification', NULLIF(p->>'classification',''), 'competitor', NULLIF(p->>'competitor',''),
      'expected_monthly_sales', NULLIF(p->>'expected_monthly_sales',''), 'secondary_mobile', NULLIF(p->>'mobile2',''),
      'national_address_short', NULLIF(p->>'na_short',''), 'building_number', NULLIF(p->>'building_no',''),
      'additional_number', NULLIF(p->>'additional_no',''), 'postal_code', NULLIF(p->>'postal_code','')));
    v_code := 'C' || to_char(now() AT TIME ZONE 'utc', 'YYMMDD') || upper(substr(md5(random()::text),1,5));
    INSERT INTO erp_customers (company_id, branch_id, salesman_id, route_id, code, name, name_ar,
       phone, contact_person, contact_phone, city, national_address, latitude, longitude,
       cr_number, tax_number, is_vat_registered, external_id, payment_type,
       credit_limit, payment_terms_days, custom, is_approved, approval_status, created_source)
    VALUES (v_co, NULLIF(p->>'branch_id','')::uuid, req.salesman_id, NULLIF(p->>'route_id','')::uuid, v_code,
       trim(p->>'name'), COALESCE(NULLIF(trim(p->>'name_ar'),''), trim(p->>'name')),
       NULLIF(p->>'mobile',''), NULLIF(p->>'owner',''), NULLIF(p->>'mobile2',''),
       NULLIF(p->>'city',''), NULLIF(p->>'na_full',''),
       NULLIF(p->>'latitude','')::numeric, NULLIF(p->>'longitude','')::numeric,
       NULLIF(p->>'cr',''), NULLIF(p->>'vat',''), (NULLIF(p->>'vat','') IS NOT NULL),
       NULLIF(p->>'existing_code',''), NULLIF(p->>'payment_type',''),
       COALESCE(NULLIF(p->>'requested_credit_limit','')::numeric, 0), NULLIF(p->>'requested_terms','')::int,
       COALESCE(v_custom, '{}'::jsonb), true, 'approved', 'request')
    RETURNING id INTO v_applied;

  ELSIF req.kind = 'gps_correction' THEN
    UPDATE erp_customers SET latitude=(p->>'new_lat')::numeric, longitude=(p->>'new_lng')::numeric, updated_at=now() WHERE id=req.customer_id;
    v_applied := req.customer_id;
  ELSIF req.kind = 'credit_limit' THEN
    UPDATE erp_customers SET credit_limit=(p->>'new_limit')::numeric, updated_at=now() WHERE id=req.customer_id;
    v_applied := req.customer_id;
  ELSIF req.kind = 'payment_terms' THEN
    UPDATE erp_customers SET payment_terms_days=(p->>'new_terms')::int, updated_at=now() WHERE id=req.customer_id;
    v_applied := req.customer_id;
  ELSIF req.kind = 'route_transfer' THEN
    UPDATE erp_customers SET
      route_id = COALESCE(NULLIF(p->>'req_route','')::uuid, route_id),
      salesman_id = COALESCE(NULLIF(p->>'req_salesman','')::uuid, salesman_id),
      updated_at = now()
    WHERE id = req.customer_id;
    v_applied := req.customer_id;
  ELSIF req.kind = 'reactivate' THEN
    UPDATE erp_customers SET is_active=true, customer_status='active', updated_at=now() WHERE id=req.customer_id;
    v_applied := req.customer_id;
  ELSIF req.kind = 'close' THEN
    UPDATE erp_customers SET is_active=false, customer_status='closed', updated_at=now() WHERE id=req.customer_id;
    v_applied := req.customer_id;

  ELSIF req.kind = 'data_update' THEN
    v_field := p->>'field'; v_new := p->>'new_value';
    IF v_field = 'credit_limit' THEN
      EXECUTE 'UPDATE erp_customers SET credit_limit=$1, updated_at=now() WHERE id=$2' USING NULLIF(v_new,'')::numeric, req.customer_id;
    ELSIF v_field = 'payment_terms_days' THEN
      EXECUTE 'UPDATE erp_customers SET payment_terms_days=$1, updated_at=now() WHERE id=$2' USING NULLIF(v_new,'')::int, req.customer_id;
    ELSIF v_field IN ('name','name_ar','phone','city','address','cr_number','tax_number','national_address','contact_person') THEN
      EXECUTE format('UPDATE erp_customers SET %I=$1, updated_at=now() WHERE id=$2', v_field) USING NULLIF(v_new,''), req.customer_id;
    ELSE
      RAISE EXCEPTION 'field is not editable by request' USING errcode='check_violation';
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
