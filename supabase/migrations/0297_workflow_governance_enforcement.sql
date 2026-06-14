-- ============================================================================
-- 0297: Approval engine — governance enforcement (self-approval + reject reason)
-- ----------------------------------------------------------------------------
-- Convergence Phase 1 (foundation). This is a FAITHFUL SUPERSET of the live
-- erp_workflow_decide: the entire existing body (auth, authority-limit check,
-- quorum, conditional multi-step routing, audit) is preserved verbatim. It adds
-- only two guards, both gated by the 0296 definition flags which DEFAULT OFF —
-- so every current workflow behaves byte-identically until a tenant opts in:
--   • block_self_approval  → the instance's starter cannot APPROVE it.
--   • require_reject_reason → a REJECT must carry a non-empty comment.
-- Reversible: re-applying 0089/later decide restores prior behaviour.
-- ============================================================================
create or replace function erp_workflow_decide(
  p_task_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_task erp_workflow_tasks; v_inst erp_workflow_instances; v_def erp_workflow_definitions;
  v_cur erp_workflow_steps; v_next erp_workflow_steps; v_step erp_workflow_steps;
  v_amount numeric; v_approved int; v_final boolean := false; v_status text := 'pending'; v_has_next boolean := false;
begin
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;
  select * into v_task from erp_workflow_tasks where id = p_task_id;
  if v_task.id is null or v_task.status <> 'pending' then raise exception 'task not actionable'; end if;
  select * into v_inst from erp_workflow_instances where id = v_task.instance_id;
  if v_inst.status <> 'pending' then raise exception 'workflow not active'; end if;
  if not erp_workflow_user_can_act(v_inst.company_id, v_task.assignee_type, v_task.assignee_ref) then
    raise exception 'not authorized to decide this task';
  end if;

  -- ── Governance guards (0296 flags; default OFF ⇒ legacy behaviour) ─────────
  select * into v_def from erp_workflow_definitions where id = v_inst.definition_id;
  if v_def.block_self_approval and p_decision = 'approve'
     and v_inst.started_by is not null and v_inst.started_by = auth.uid() then
    raise exception 'cannot approve your own request' using errcode = 'check_violation';
  end if;
  if v_def.require_reject_reason and p_decision = 'reject'
     and coalesce(btrim(p_comment), '') = '' then
    raise exception 'reject reason required' using errcode = 'check_violation';
  end if;

  -- ── Authority-limit check on approve (unchanged) ──────────────────────────
  if p_decision = 'approve' then
    if v_def.approval_action is not null then
      v_amount := nullif(v_inst.context->>'amount','')::numeric;
      if v_amount is not null and not erp_within_limit(v_def.approval_action, v_amount, null) then
        raise exception 'approval amount % exceeds your authority limit for %', v_amount, v_def.approval_action using errcode = 'check_violation';
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
    select * into v_cur from erp_workflow_steps where definition_id=v_inst.definition_id and step_no=v_inst.current_step;
    select count(*) into v_approved from erp_workflow_tasks where instance_id=v_inst.id and step_no=v_inst.current_step and status='approved';
    if v_approved >= coalesce(v_cur.required_approvals,1) then
      update erp_workflow_tasks set status='expired' where instance_id=v_inst.id and step_no=v_inst.current_step and status='pending';
      for v_step in select * from erp_workflow_steps where definition_id=v_inst.definition_id and step_no > v_inst.current_step order by step_no loop
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
