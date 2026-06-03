-- ============================================================================
-- 0122: Authorization Phase 4 (P4) — Constraints / Limits + Workflow
--                                     Amount-Routing
-- ----------------------------------------------------------------------------
-- Adds the CONSTRAINT axis of the authorization model (Capability × Scope ×
-- Constraint × Field): per-user / per-role NUMERIC approval authority — "how
-- much" a subject may approve / override — and binds it into the existing
-- workflow decision path, OPT-IN, while staying 100% CUTOVER-SAFE.
--
-- PRIME DIRECTIVE — ZERO-ROWS / NULL-COLUMN = BYTE-IDENTICAL:
--   * erp_within_limit(action, amount[, percent]) returns TRUE when the current
--     user has NO applicable limit row for that action. With zero erp_role_limits
--     rows (today's state) it is a pure no-op → every caller behaves exactly as
--     before.
--   * erp_workflow_definitions gains a NULLABLE `approval_action`. The amount
--     check inside erp_workflow_decide only fires when a definition has a
--     non-null approval_action AND the instance context carries a numeric amount.
--     Every existing definition has approval_action = NULL, so the decide path is
--     byte-identical to 0089 in production.
--
-- The new finer capabilities (purchasing.po.approve, accounting.voucher.approve,
-- inventory.adjustment.approve, sales.price.override, sales.payment.writeoff, …)
-- are deny-all until P6 grants them, so the constraint machinery is dormant in
-- production until both a capability grant (P6) and a limit declaration exist.
--
-- Posture: erp_within_limit is STABLE SECURITY DEFINER + pinned search_path +
-- anon/public revoked + authenticated/service_role granted (so server actions
-- may also pre-check, e.g. a price override at sale time). The workflow RPCs keep
-- their 0089 grant posture. Forward-only, idempotent.
-- ============================================================================

-- ── 1. erp_role_limits — declared per-subject numeric authority ───────────────
-- Subject is EXACTLY ONE of: a specific user (user_id) — authoritative override —
-- or a role default (role_key). `action` is a capability-style key the constraint
-- applies to. NULL max_* = unlimited / uncapped for that facet.
CREATE TABLE IF NOT EXISTS erp_role_limits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_key    TEXT,
  action      TEXT NOT NULL,
  max_amount  NUMERIC,
  max_percent NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- exactly one subject: user-specific XOR role default
  CONSTRAINT erp_role_limits_one_subject CHECK ((user_id IS NULL) <> (role_key IS NULL)),
  CONSTRAINT erp_role_limits_amount_nonneg CHECK (max_amount IS NULL OR max_amount >= 0),
  CONSTRAINT erp_role_limits_percent_range CHECK (max_percent IS NULL OR (max_percent >= 0 AND max_percent <= 100)),
  -- one limit per (subject, action); NULLS NOT DISTINCT so the null subject side
  -- collapses correctly (role-default rows unique on role_key; user rows on user_id).
  UNIQUE NULLS NOT DISTINCT (company_id, user_id, role_key, action)
);

CREATE INDEX IF NOT EXISTS idx_erp_role_limits_company ON erp_role_limits(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_role_limits_user    ON erp_role_limits(company_id, user_id, action);
CREATE INDEX IF NOT EXISTS idx_erp_role_limits_role    ON erp_role_limits(company_id, role_key, action);

-- RLS + triggers + policies — same pattern as erp_role_scope (0121):
-- read = any company member; write = company admin / platform owner.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_role_limits ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_role_limits_set_company ON erp_role_limits';
  EXECUTE 'CREATE TRIGGER erp_role_limits_set_company BEFORE INSERT ON erp_role_limits FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_role_limits_updated ON erp_role_limits';
  EXECUTE 'CREATE TRIGGER erp_role_limits_updated BEFORE UPDATE ON erp_role_limits FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';

  EXECUTE 'DROP POLICY IF EXISTS "erp_role_limits_read" ON erp_role_limits';
  EXECUTE 'CREATE POLICY "erp_role_limits_read" ON erp_role_limits FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';

  EXECUTE 'DROP POLICY IF EXISTS "erp_role_limits_write" ON erp_role_limits';
  EXECUTE $p$
    CREATE POLICY "erp_role_limits_write" ON erp_role_limits FOR ALL
      USING (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND 'admin' = ANY(erp_user_roles()))
      )
      WITH CHECK (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND 'admin' = ANY(erp_user_roles()))
      )
  $p$;
END $$;

-- ── 2. erp_within_limit — cutover-safe constraint resolver ────────────────────
-- Returns whether the CURRENT user may act on p_action for the given amount /
-- percent. Resolution:
--   * platform owner / no company context → TRUE (unconstrained).
--   * a USER-specific row for the action is authoritative (overrides role rows);
--     NULL max_* on it = unlimited for that facet.
--   * else ROLE-default rows for the user's roles: MOST PERMISSIVE wins — if any
--     applicable role row has NULL max_amount it is unlimited, otherwise the MAX
--     across rows (holding more roles never REDUCES authority).
--   * NO applicable row → TRUE (CUTOVER-SAFE no-op).
CREATE OR REPLACE FUNCTION erp_within_limit(
  p_action text, p_amount numeric, p_percent numeric DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co uuid := erp_user_company_id();
  v_has_user boolean := false;
  eff_amount numeric;
  eff_percent numeric;
  v_unl_amount boolean;
  v_unl_percent boolean;
BEGIN
  IF erp_is_platform_owner() THEN RETURN true; END IF;
  IF v_co IS NULL THEN RETURN true; END IF;

  -- USER-specific row is authoritative when present.
  SELECT true INTO v_has_user FROM erp_role_limits
   WHERE company_id = v_co AND user_id = auth.uid() AND action = p_action LIMIT 1;

  IF v_has_user THEN
    SELECT max_amount, max_percent INTO eff_amount, eff_percent
      FROM erp_role_limits
     WHERE company_id = v_co AND user_id = auth.uid() AND action = p_action
     LIMIT 1;
  ELSE
    -- ROLE defaults for the user's roles.
    IF NOT EXISTS (
      SELECT 1 FROM erp_role_limits
       WHERE company_id = v_co AND user_id IS NULL AND action = p_action
         AND role_key = ANY(erp_user_roles())
    ) THEN
      RETURN true;  -- CUTOVER-SAFE: no constraint declared for this user / action
    END IF;
    SELECT bool_or(max_amount IS NULL), max(max_amount),
           bool_or(max_percent IS NULL), max(max_percent)
      INTO v_unl_amount, eff_amount, v_unl_percent, eff_percent
      FROM erp_role_limits
     WHERE company_id = v_co AND user_id IS NULL AND action = p_action
       AND role_key = ANY(erp_user_roles());
    IF v_unl_amount THEN eff_amount := NULL; END IF;
    IF v_unl_percent THEN eff_percent := NULL; END IF;
  END IF;

  RETURN (eff_amount  IS NULL OR p_amount  IS NULL OR p_amount  <= eff_amount)
     AND (eff_percent IS NULL OR p_percent IS NULL OR p_percent <= eff_percent);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_within_limit(text, numeric, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_within_limit(text, numeric, numeric) TO authenticated, service_role;

-- ── 3. Opt-in amount-routing binding on workflow definitions ──────────────────
-- A definition may name the constraint action its approvals are checked against.
-- NULL (every existing definition) → no constraint check (0089 behavior).
ALTER TABLE erp_workflow_definitions ADD COLUMN IF NOT EXISTS approval_action TEXT;

-- ── 4. Re-emit erp_workflow_decide with the OPT-IN limit check ────────────────
-- Identical to 0089 except: when the definition has a non-null approval_action
-- and the instance context carries a numeric `amount`, an APPROVE decision is
-- gated by erp_within_limit(approval_action, amount). Over-limit approvals raise.
CREATE OR REPLACE FUNCTION erp_workflow_decide(
  p_task_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_task erp_workflow_tasks;
  v_inst erp_workflow_instances;
  v_def  erp_workflow_definitions;
  v_cur  erp_workflow_steps;
  v_next erp_workflow_steps;
  v_step erp_workflow_steps;
  v_amount numeric;
  v_approved int;
  v_final boolean := false;
  v_status text := 'pending';
  v_has_next boolean := false;
begin
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;
  select * into v_task from erp_workflow_tasks where id = p_task_id;
  if v_task.id is null or v_task.status <> 'pending' then raise exception 'task not actionable'; end if;
  select * into v_inst from erp_workflow_instances where id = v_task.instance_id;
  if v_inst.status <> 'pending' then raise exception 'workflow not active'; end if;

  if not erp_workflow_user_can_act(v_inst.company_id, v_task.assignee_type, v_task.assignee_ref) then
    raise exception 'not authorized to decide this task';
  end if;

  -- P4: opt-in numeric-authority (constraint) check on APPROVE. Dormant unless the
  -- definition declares approval_action AND the context carries a numeric amount.
  if p_decision = 'approve' then
    select * into v_def from erp_workflow_definitions where id = v_inst.definition_id;
    if v_def.approval_action is not null then
      v_amount := nullif(v_inst.context->>'amount','')::numeric;
      if v_amount is not null and not erp_within_limit(v_def.approval_action, v_amount, null) then
        raise exception 'approval amount % exceeds your authority limit for %', v_amount, v_def.approval_action
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  update erp_workflow_tasks
     set status = case when p_decision='approve' then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), comment = p_comment
   where id = p_task_id;

  if p_decision = 'reject' then
    update erp_workflow_instances set status='rejected', completed_at=now() where id=v_inst.id;
    update erp_workflow_tasks set status='expired' where instance_id=v_inst.id and status='pending';
    v_final := true; v_status := 'rejected';
  else
    select * into v_cur from erp_workflow_steps
      where definition_id=v_inst.definition_id and step_no=v_inst.current_step;
    select count(*) into v_approved from erp_workflow_tasks
      where instance_id=v_inst.id and step_no=v_inst.current_step and status='approved';

    if v_approved >= coalesce(v_cur.required_approvals,1) then
      update erp_workflow_tasks set status='expired'
        where instance_id=v_inst.id and step_no=v_inst.current_step and status='pending';
      for v_step in select * from erp_workflow_steps
          where definition_id=v_inst.definition_id and step_no > v_inst.current_step order by step_no loop
        if erp_workflow_condition_met(v_step.condition, v_inst.context) then v_next := v_step; v_has_next := true; exit; end if;
      end loop;
      if v_has_next then
        update erp_workflow_instances set current_step = v_next.step_no where id=v_inst.id;
        perform erp_workflow_make_tasks(v_inst.company_id, v_inst.id, v_next);
        v_status := 'pending';
      else
        update erp_workflow_instances set status='approved', completed_at=now() where id=v_inst.id;
        v_final := true; v_status := 'approved';
      end if;
    end if;
  end if;

  perform erp_log_audit('decide','workflow_task', p_task_id::text,
    jsonb_build_object('decision',p_decision,'final',v_final,'instance',v_inst.id), v_inst.company_id);
  return jsonb_build_object('final', v_final, 'status', v_status, 'entity', v_inst.entity, 'record_id', v_inst.record_id);
end; $$;

-- Preserve the 0089 grant posture (CREATE OR REPLACE keeps ACL, restated for clarity).
REVOKE ALL ON FUNCTION erp_workflow_decide(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION erp_workflow_decide(uuid,text,text) TO authenticated;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- Restore the 0089 body of erp_workflow_decide (no approval_action / limit check),
-- then:
--   ALTER TABLE erp_workflow_definitions DROP COLUMN IF EXISTS approval_action;
--   DROP FUNCTION IF EXISTS erp_within_limit(text, numeric, numeric);
--   DROP TABLE IF EXISTS erp_role_limits;
