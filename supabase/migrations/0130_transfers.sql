-- ============================================================================
-- 0130: FMCG Operations — Customer & User transfers (audited, approval-aware)
-- ----------------------------------------------------------------------------
-- Transfers change a customer's region/branch/route/salesman, or a user's
-- branch/role/reporting line, WITHOUT touching historical visits/orders. They are
-- recorded with full history, can require approval, and update FUTURE journey
-- plans safely. RPCs self-guard on (a) tenant scope and (b) the caller's granular
-- permission via the new erp_user_has_perm() helper — defense-in-depth on top of
-- the action layer.
-- ============================================================================

-- ── Self-guarding permission helper (mirrors auth-context resolution) ─────────
CREATE OR REPLACE FUNCTION erp_user_has_perm(p_perm text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid; v_has_cfg boolean; v_ok boolean;
BEGIN
  IF erp_is_platform_owner() OR erp_is_super_admin() THEN RETURN true; END IF;
  v_co := erp_user_company_id();
  IF v_co IS NULL THEN RETURN false; END IF;
  SELECT EXISTS(SELECT 1 FROM erp_company_roles WHERE company_id = v_co) INTO v_has_cfg;
  IF v_has_cfg THEN
    SELECT EXISTS(
      SELECT 1 FROM erp_company_role_permissions crp
      JOIN erp_company_roles cr ON cr.company_id = crp.company_id AND cr.role_key = crp.role_key AND cr.enabled
      WHERE crp.company_id = v_co AND crp.permission = p_perm
        AND crp.role_key IN (SELECT ub.role FROM erp_user_branches ub JOIN erp_branches b ON b.id = ub.branch_id
                             WHERE ub.user_id = auth.uid() AND b.company_id = v_co)
    ) INTO v_ok;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM erp_role_permissions rp
      WHERE rp.permission = p_perm
        AND rp.role_key IN (SELECT ub.role FROM erp_user_branches ub JOIN erp_branches b ON b.id = ub.branch_id
                            WHERE ub.user_id = auth.uid() AND b.company_id = v_co)
    ) INTO v_ok;
  END IF;
  RETURN COALESCE(v_ok, false);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_user_has_perm(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_user_has_perm(text) TO authenticated, service_role;

-- ── Customer transfers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_customer_transfers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  from_region_id UUID, to_region_id UUID,
  from_branch_id UUID, to_branch_id UUID,
  from_route_id  UUID, to_route_id  UUID,
  from_salesman_id UUID, to_salesman_id UUID,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('pending','applied','rejected','cancelled')),
  requested_by   UUID,
  decided_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at     TIMESTAMPTZ,
  decided_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_erp_customer_transfers_customer ON erp_customer_transfers(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_customer_transfers_company ON erp_customer_transfers(company_id, status);

CREATE TABLE IF NOT EXISTS erp_user_assignment_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  from_branch_id  UUID, to_branch_id UUID,
  from_role       TEXT, to_role TEXT,
  from_reports_to UUID, to_reports_to UUID,
  moved_customers BOOLEAN NOT NULL DEFAULT false,
  reason          TEXT,
  changed_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_user_assignment_history_user ON erp_user_assignment_history(user_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_customer_transfers ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE erp_user_assignment_history ENABLE ROW LEVEL SECURITY';
  -- company_id trigger + RLS (read members; write company-scoped, action enforces perm)
  EXECUTE 'DROP TRIGGER IF EXISTS erp_customer_transfers_set_company ON erp_customer_transfers';
  EXECUTE 'CREATE TRIGGER erp_customer_transfers_set_company BEFORE INSERT ON erp_customer_transfers FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_customer_transfers_read ON erp_customer_transfers';
  EXECUTE 'CREATE POLICY erp_customer_transfers_read ON erp_customer_transfers FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_customer_transfers_write ON erp_customer_transfers';
  EXECUTE 'CREATE POLICY erp_customer_transfers_write ON erp_customer_transfers FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_user_assignment_history_set_company ON erp_user_assignment_history';
  EXECUTE 'CREATE TRIGGER erp_user_assignment_history_set_company BEFORE INSERT ON erp_user_assignment_history FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_user_assignment_history_read ON erp_user_assignment_history';
  EXECUTE 'CREATE POLICY erp_user_assignment_history_read ON erp_user_assignment_history FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_user_assignment_history_write ON erp_user_assignment_history';
  EXECUTE 'CREATE POLICY erp_user_assignment_history_write ON erp_user_assignment_history FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- Apply a customer transfer row to the master + FUTURE journey plans.
CREATE OR REPLACE FUNCTION erp_apply_customer_transfer_row(p_transfer erp_customer_transfers)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE erp_customers
     SET region_id   = COALESCE(p_transfer.to_region_id, region_id),
         branch_id   = COALESCE(p_transfer.to_branch_id, branch_id),
         route_id    = COALESCE(p_transfer.to_route_id, route_id),
         salesman_id = COALESCE(p_transfer.to_salesman_id, salesman_id),
         updated_source = 'transfer'
   WHERE id = p_transfer.customer_id;

  -- FUTURE journey plans follow the new salesman/route; past visits untouched.
  UPDATE erp_journey_plans
     SET salesman_id = COALESCE(p_transfer.to_salesman_id, salesman_id),
         route_id    = COALESCE(p_transfer.to_route_id, route_id)
   WHERE customer_id = p_transfer.customer_id
     AND status = 'active'
     AND (effective_to IS NULL OR effective_to >= CURRENT_DATE);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_apply_customer_transfer_row(erp_customer_transfers) FROM anon, public, authenticated;

-- Request (and optionally auto-apply) a customer transfer.
CREATE OR REPLACE FUNCTION erp_transfer_customer(
  p_customer_id uuid, p_to_region_id uuid, p_to_branch_id uuid, p_to_route_id uuid,
  p_to_salesman_id uuid, p_reason text, p_require_approval boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid := erp_user_company_id(); c RECORD; v_id uuid; v_tr erp_customer_transfers;
BEGIN
  IF NOT erp_user_has_perm('customer.transfer') THEN
    RAISE EXCEPTION 'not authorized: customer.transfer' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO c FROM erp_customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF NOT erp_is_platform_owner() AND c.company_id IS DISTINCT FROM v_co THEN
    RAISE EXCEPTION 'cross-tenant transfer denied' USING errcode = 'insufficient_privilege';
  END IF;

  INSERT INTO erp_customer_transfers(
    company_id, customer_id, from_region_id, to_region_id, from_branch_id, to_branch_id,
    from_route_id, to_route_id, from_salesman_id, to_salesman_id, reason,
    status, requested_by, applied_at, decided_by, decided_at)
  VALUES (
    c.company_id, p_customer_id, c.region_id, COALESCE(p_to_region_id, c.region_id),
    c.branch_id, COALESCE(p_to_branch_id, c.branch_id), c.route_id, COALESCE(p_to_route_id, c.route_id),
    c.salesman_id, COALESCE(p_to_salesman_id, c.salesman_id), p_reason,
    CASE WHEN p_require_approval THEN 'pending' ELSE 'applied' END, auth.uid(),
    CASE WHEN p_require_approval THEN NULL ELSE now() END,
    CASE WHEN p_require_approval THEN NULL ELSE auth.uid() END,
    CASE WHEN p_require_approval THEN NULL ELSE now() END)
  RETURNING id INTO v_id;

  IF NOT p_require_approval THEN
    SELECT * INTO v_tr FROM erp_customer_transfers WHERE id = v_id;
    PERFORM erp_apply_customer_transfer_row(v_tr);
  END IF;

  PERFORM erp_log_audit('transfer', 'customer', p_customer_id::text,
    jsonb_build_object('transfer_id', v_id, 'require_approval', p_require_approval,
      'to_branch', p_to_branch_id, 'to_route', p_to_route_id, 'to_salesman', p_to_salesman_id), c.company_id);
  RETURN jsonb_build_object('transfer_id', v_id, 'status', CASE WHEN p_require_approval THEN 'pending' ELSE 'applied' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_transfer_customer(uuid,uuid,uuid,uuid,uuid,text,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_transfer_customer(uuid,uuid,uuid,uuid,uuid,text,boolean) TO authenticated, service_role;

-- Approve (apply) a pending customer transfer.
CREATE OR REPLACE FUNCTION erp_approve_customer_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_tr erp_customer_transfers;
BEGIN
  IF NOT erp_user_has_perm('customer.transfer') THEN
    RAISE EXCEPTION 'not authorized: customer.transfer' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_tr FROM erp_customer_transfers WHERE id = p_transfer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_tr.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_tr.status <> 'pending' THEN RAISE EXCEPTION 'transfer not pending'; END IF;

  UPDATE erp_customer_transfers SET status='applied', decided_by=auth.uid(), decided_at=now(), applied_at=now() WHERE id=p_transfer_id;
  SELECT * INTO v_tr FROM erp_customer_transfers WHERE id = p_transfer_id;
  PERFORM erp_apply_customer_transfer_row(v_tr);
  PERFORM erp_log_audit('approve_transfer','customer', v_tr.customer_id::text, jsonb_build_object('transfer_id', p_transfer_id), v_tr.company_id);
  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'applied');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_approve_customer_transfer(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_approve_customer_transfer(uuid) TO authenticated, service_role;

-- ── User transfer ─────────────────────────────────────────────────────────────
-- Moves a user's membership (branch/role/reports_to); optionally moves their
-- customers; recalculates scope automatically via reports_to. History recorded.
CREATE OR REPLACE FUNCTION erp_transfer_user(
  p_user_id uuid, p_current_branch_id uuid, p_to_branch_id uuid, p_to_role text,
  p_to_reports_to uuid, p_move_customers boolean DEFAULT false, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid := erp_user_company_id(); ub RECORD; v_new_branch uuid; v_new_role text; v_new_reports uuid;
BEGIN
  IF NOT erp_user_has_perm('user.transfer') THEN
    RAISE EXCEPTION 'not authorized: user.transfer' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT eub.*, b.company_id AS branch_company INTO ub
    FROM erp_user_branches eub JOIN erp_branches b ON b.id = eub.branch_id
    WHERE eub.user_id = p_user_id AND eub.branch_id = p_current_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user membership not found'; END IF;
  IF NOT erp_is_platform_owner() AND ub.branch_company IS DISTINCT FROM v_co THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;

  v_new_branch  := COALESCE(p_to_branch_id, ub.branch_id);
  v_new_role    := COALESCE(p_to_role, ub.role);
  v_new_reports := COALESCE(p_to_reports_to, ub.reports_to);

  UPDATE erp_user_branches
     SET branch_id = v_new_branch, role = v_new_role, reports_to = v_new_reports
   WHERE user_id = p_user_id AND branch_id = p_current_branch_id;

  IF p_move_customers AND p_to_branch_id IS NOT NULL THEN
    UPDATE erp_customers SET branch_id = p_to_branch_id, updated_source = 'transfer'
     WHERE salesman_id = p_user_id AND company_id = ub.branch_company;
  END IF;

  INSERT INTO erp_user_assignment_history(
    company_id, user_id, from_branch_id, to_branch_id, from_role, to_role,
    from_reports_to, to_reports_to, moved_customers, reason, changed_by)
  VALUES (ub.branch_company, p_user_id, ub.branch_id, v_new_branch, ub.role, v_new_role,
          ub.reports_to, v_new_reports, COALESCE(p_move_customers,false), p_reason, auth.uid());

  PERFORM erp_log_audit('transfer','user', p_user_id::text,
    jsonb_build_object('to_branch', v_new_branch, 'to_role', v_new_role, 'to_reports_to', v_new_reports,
      'moved_customers', p_move_customers), ub.branch_company);
  RETURN jsonb_build_object('user_id', p_user_id, 'branch_id', v_new_branch, 'role', v_new_role);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_transfer_user(uuid,uuid,uuid,text,uuid,boolean,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_transfer_user(uuid,uuid,uuid,text,uuid,boolean,text) TO authenticated, service_role;

-- ── Rollback (manual): drop the functions + erp_user_assignment_history +
-- erp_customer_transfers + erp_user_has_perm. ───────────────────────────────────
