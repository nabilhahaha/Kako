-- ============================================================================
-- 0090: Workflow / Approval Engine — Phase 3 (SLA timers, escalations, in-app
-- notifications). Same entity-agnostic engine. Scheduler: Supabase pg_cron
-- (enabled defensively — if unavailable in an environment the migration still
-- succeeds and erp_workflow_tick() can be driven by a Vercel Cron fallback).
-- Notifications are IN-APP only now, but the channel column keeps the door open
-- for future channels (WhatsApp/email) without schema change. Additive.
-- ============================================================================

-- Per-user in-app notifications (company-scoped). `channel` is an extension
-- point; Phase 3 only writes 'in_app'.
create table if not exists erp_notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  user_id     uuid not null references erp_profiles(id) on delete cascade,
  type        text not null,
  title_ar    text,
  title_en    text,
  body        text,
  link        text,
  entity      text,
  record_id   text,
  channel     text not null default 'in_app',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on erp_notifications(user_id, is_read, created_at desc);

alter table erp_notifications enable row level security;
drop policy if exists erp_notif_read on erp_notifications;
create policy erp_notif_read on erp_notifications for select
  using ((select erp_is_platform_owner()) or user_id = (select auth.uid()));
drop policy if exists erp_notif_update on erp_notifications;     -- recipient marks read
create policy erp_notif_update on erp_notifications for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists erp_notif_owner on erp_notifications;       -- backstop; rows written via definer fns
create policy erp_notif_owner on erp_notifications for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- SLA escalation marker on tasks.
alter table erp_workflow_tasks add column if not exists escalated_at timestamptz;

-- Insert an in-app notification (called only by SECURITY DEFINER engine fns).
create or replace function erp_notify(
  p_company uuid, p_user uuid, p_type text, p_title_ar text, p_title_en text,
  p_body text, p_link text, p_entity text, p_record_id text)
returns void language sql security definer set search_path to 'public','pg_temp' as $$
  insert into erp_notifications(company_id,user_id,type,title_ar,title_en,body,link,entity,record_id)
  values (p_company,p_user,p_type,p_title_ar,p_title_en,p_body,p_link,p_entity,p_record_id);
$$;

-- make_tasks (rewritten): also notify the step's assignees (in-app).
create or replace function erp_workflow_make_tasks(p_company uuid, p_instance uuid, p_step erp_workflow_steps)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_uid uuid; v_n int := 0; v_due timestamptz; v_ent text; v_rid text;
begin
  v_due := case when p_step.sla_hours is not null then now() + (p_step.sla_hours || ' hours')::interval end;
  select entity, record_id into v_ent, v_rid from erp_workflow_instances where id = p_instance;
  if p_step.mode = 'parallel' then
    for v_uid in select * from erp_workflow_resolve_users(p_company, p_step.approver_type, p_step.approver_ref) loop
      insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
      values (p_company, p_instance, p_step.step_no, 'user', v_uid::text, v_due);
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'no approvers resolved for parallel step %', p_step.step_no; end if;
  else
    insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
    values (p_company, p_instance, p_step.step_no, p_step.approver_type, p_step.approver_ref, v_due);
  end if;
  -- Notify everyone who could action this step.
  for v_uid in select * from erp_workflow_resolve_users(p_company, p_step.approver_type, p_step.approver_ref) loop
    perform erp_notify(p_company, v_uid, 'workflow_task_assigned',
      'مهمة موافقة جديدة', 'New approval task', null, '/approvals', v_ent, v_rid);
  end loop;
end; $$;

-- decide (rewritten): notify the initiator when the instance completes.
create or replace function erp_workflow_decide(
  p_task_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_task erp_workflow_tasks; v_inst erp_workflow_instances;
  v_cur erp_workflow_steps; v_next erp_workflow_steps; v_step erp_workflow_steps;
  v_approved int; v_final boolean := false; v_status text := 'pending'; v_has_next boolean := false;
begin
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;
  select * into v_task from erp_workflow_tasks where id = p_task_id;
  if v_task.id is null or v_task.status <> 'pending' then raise exception 'task not actionable'; end if;
  select * into v_inst from erp_workflow_instances where id = v_task.instance_id;
  if v_inst.status <> 'pending' then raise exception 'workflow not active'; end if;
  if not erp_workflow_user_can_act(v_inst.company_id, v_task.assignee_type, v_task.assignee_ref) then
    raise exception 'not authorized to decide this task';
  end if;

  update erp_workflow_tasks set status = case when p_decision='approve' then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), comment = p_comment where id = p_task_id;

  if p_decision = 'reject' then
    update erp_workflow_instances set status='rejected', completed_at=now() where id=v_inst.id;
    update erp_workflow_tasks set status='expired' where instance_id=v_inst.id and status='pending';
    v_final := true; v_status := 'rejected';
  else
    select * into v_cur from erp_workflow_steps where definition_id=v_inst.definition_id and step_no=v_inst.current_step;
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

  if v_final and v_inst.started_by is not null then
    perform erp_notify(v_inst.company_id, v_inst.started_by, 'workflow_decided',
      case when v_status='approved' then 'تم اعتماد طلبك' else 'تم رفض طلبك' end,
      case when v_status='approved' then 'Your request was approved' else 'Your request was rejected' end,
      null, '/approvals', v_inst.entity, v_inst.record_id);
  end if;

  perform erp_log_audit('decide','workflow_task', p_task_id::text,
    jsonb_build_object('decision',p_decision,'final',v_final,'instance',v_inst.id), v_inst.company_id);
  return jsonb_build_object('final', v_final, 'status', v_status, 'entity', v_inst.entity, 'record_id', v_inst.record_id);
end; $$;

-- SLA escalation worker (system job): for each overdue pending task, escalate to
-- the assignee's manager (reports_to) — or notify company admins if no manager —
-- and notify. Idempotent via escalated_at. Driven by pg_cron (or Vercel Cron).
create or replace function erp_workflow_tick()
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare r record; v_mgr uuid; v_uid uuid; v_n int := 0;
begin
  for r in
    select t.id, t.instance_id, t.step_no, t.assignee_type, t.assignee_ref,
           i.company_id as ci, i.entity as ent, i.record_id as rid
    from erp_workflow_tasks t join erp_workflow_instances i on i.id = t.instance_id
    where t.status='pending' and t.due_at is not null and t.due_at < now() and t.escalated_at is null
      and i.status='pending'
  loop
    update erp_workflow_tasks set escalated_at = now() where id = r.id;
    v_mgr := null;
    if r.assignee_type='user' and r.assignee_ref is not null then
      select reports_to into v_mgr from erp_user_branches
        where user_id = r.assignee_ref::uuid and reports_to is not null limit 1;
    end if;
    if v_mgr is not null then
      insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref)
      values (r.ci, r.instance_id, r.step_no, 'user', v_mgr::text);
      perform erp_notify(r.ci, v_mgr, 'workflow_escalated', 'مهمة موافقة مُصعّدة', 'Escalated approval',
        null, '/approvals', r.ent, r.rid);
    else
      for v_uid in select * from erp_workflow_resolve_users(r.ci, 'company_admin', null) loop
        perform erp_notify(r.ci, v_uid, 'workflow_escalated', 'مهمة موافقة متأخرة', 'Overdue approval',
          null, '/approvals', r.ent, r.rid);
      end loop;
    end if;
    perform erp_log_audit('escalate','workflow_task', r.id::text, jsonb_build_object('manager', v_mgr), r.ci);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $$;

revoke all on function erp_notify(uuid,uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function erp_workflow_tick() from public, anon, authenticated;

-- Schedule the tick via pg_cron, defensively (no-op + notice if unavailable).
do $$
begin
  create extension if not exists pg_cron;
  begin perform cron.unschedule('erp-workflow-tick'); exception when others then null; end;
  perform cron.schedule('erp-workflow-tick', '*/10 * * * *', 'select erp_workflow_tick();');
exception when others then
  raise notice 'pg_cron unavailable (%); run erp_workflow_tick() via Vercel Cron fallback instead.', sqlerrm;
end $$;
