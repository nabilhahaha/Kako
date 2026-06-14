-- ============================================================================
-- 0300: Approval engine — SLA escalation routing (P4 foundation)
-- ----------------------------------------------------------------------------
-- ADDITIVE + idempotent + DORMANT. A NEW function escalates overdue pending
-- tasks: for any pending task past its due_at whose step defines escalate_to, it
-- ADDS an approver (the escalation target) as a 'user' task and stamps the
-- original task's escalated_at. It does NOT change instance status or the decide
-- RPC, so existing decisions keep working and either the original or the
-- escalation approver can act. Idempotent (escalated_at guards re-escalation).
-- Inert until something calls it (e.g. a scheduled pg_cron job — wired in infra,
-- not here). escalate_to is read as 'company_admin' or a role key.
--
-- Rollback: drop function erp_workflow_escalate_overdue();  (no data affected)
-- ============================================================================
create or replace function erp_workflow_escalate_overdue()
returns integer language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  r record; v_uid uuid; v_n int := 0;
  v_type text; v_ref text;
begin
  for r in
    select t.id as task_id, t.instance_id, t.company_id, t.step_no, s.escalate_to,
           i.entity, i.record_id
      from erp_workflow_tasks t
      join erp_workflow_instances i on i.id = t.instance_id and i.status = 'pending'
      join erp_workflow_steps s on s.definition_id = i.definition_id and s.step_no = t.step_no
     where t.status = 'pending' and t.escalated_at is null
       and t.due_at is not null and t.due_at < now()
       and s.escalate_to is not null
  loop
    -- Read escalate_to as company_admin or a role key.
    if r.escalate_to = 'company_admin' then v_type := 'company_admin'; v_ref := null;
    else v_type := 'role'; v_ref := r.escalate_to; end if;

    update erp_workflow_tasks set escalated_at = now() where id = r.task_id;

    for v_uid in select * from erp_workflow_resolve_users(r.company_id, v_type, v_ref) loop
      -- avoid duplicating an identical escalation task
      if not exists (
        select 1 from erp_workflow_tasks x
        where x.instance_id = r.instance_id and x.step_no = r.step_no
          and x.assignee_type = 'user' and x.assignee_ref = v_uid::text and x.status = 'pending')
      then
        insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref)
        values (r.company_id, r.instance_id, r.step_no, 'user', v_uid::text);
        perform erp_notify(r.company_id, v_uid, 'workflow_task_escalated', 'تصعيد مهمة موافقة', 'Escalated approval task', null, '/approvals', r.entity, r.record_id);
      end if;
    end loop;

    perform erp_log_audit('escalate', 'workflow_task', r.task_id::text,
      jsonb_build_object('escalate_to', r.escalate_to), r.company_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

revoke all on function erp_workflow_escalate_overdue() from public, anon;
