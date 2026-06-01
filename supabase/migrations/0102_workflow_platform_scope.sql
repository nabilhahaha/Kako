-- ============================================================================
-- 0102: Workflow Engine — platform scope (M3)
-- ----------------------------------------------------------------------------
-- Makes the generic engine platform-capable, additively:
--   • erp_workflow_start copies the definition's scope onto the instance.
--   • erp_workflow_user_can_act authorizes platform_owner / platform_staff.
--   • erp_workflow_resolve_users enumerates platform approvers (for notify /
--     parallel platform steps).
--   • erp_workflow_make_tasks uses a scope-aware notification deep-link.
--   • Scope-aware RLS on instances / tasks / events: platform-scope rows are
--     visible & actionable only to the platform owner / staff (the requester may
--     see the status of a platform request they raised); tenant users never see
--     platform rows. Company-scope behaviour is unchanged.
-- Full audit coverage is already provided by the 0101 triggers (SECURITY
-- DEFINER → they write events + audit rows for platform-scope too).
-- ============================================================================

-- ── start: propagate scope from the definition to the instance ───────────────
create or replace function erp_workflow_start(
  p_key text, p_entity text, p_record_id text, p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_company uuid := erp_user_company_id();
  v_def erp_workflow_definitions;
  v_step erp_workflow_steps;
  v_inst uuid;
  v_ctx jsonb := coalesce(p_context,'{}'::jsonb);
  v_started boolean := false;
begin
  if v_company is null then raise exception 'no company context'; end if;
  select * into v_def from erp_workflow_definitions
   where key = p_key and entity = p_entity and is_active and (company_id = v_company or company_id is null)
   order by (company_id is not null) desc limit 1;
  if v_def.id is null then raise exception 'no active workflow definition for %/%', p_key, p_entity; end if;

  insert into erp_workflow_instances(company_id, definition_id, entity, record_id, status, current_step, context, started_by, scope)
  values (v_company, v_def.id, p_entity, p_record_id, 'pending', 0, v_ctx, auth.uid(), coalesce(v_def.scope,'company'))
  returning id into v_inst;

  for v_step in select * from erp_workflow_steps where definition_id = v_def.id order by step_no loop
    if erp_workflow_condition_met(v_step.condition, v_ctx) then
      update erp_workflow_instances set current_step = v_step.step_no where id = v_inst;
      perform erp_workflow_make_tasks(v_company, v_inst, v_step);
      v_started := true;
      exit;
    end if;
  end loop;

  if not v_started then
    update erp_workflow_instances set status='approved', completed_at=now() where id=v_inst;
  end if;

  perform erp_log_audit('start','workflow_instance', v_inst::text,
    jsonb_build_object('key',p_key,'entity',p_entity,'record_id',p_record_id,'auto_approved',not v_started), v_company);
  return v_inst;
end; $$;

-- ── user_can_act: authorize platform actors ─────────────────────────────────
create or replace function erp_workflow_user_can_act(p_company uuid, p_type text, p_ref text)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select (select erp_is_platform_owner())
      or (p_type = 'company_admin' and (select erp_is_company_admin(p_company)))
      or (p_type = 'user' and p_ref = auth.uid()::text)
      or (p_type = 'role' and exists (
            select 1 from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
            where b.company_id = p_company and ub.user_id = auth.uid() and ub.role = p_ref))
      or (p_type = 'platform_owner' and (select erp_is_platform_owner()))
      or (p_type = 'platform_staff' and p_ref is not null and (select erp_platform_has(p_ref)));
$$;

-- ── resolve_users: enumerate platform approvers (notify / parallel) ──────────
create or replace function erp_workflow_resolve_users(p_company uuid, p_type text, p_ref text)
returns setof uuid language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select p_ref::uuid where p_type = 'user' and p_ref is not null
  union
  select distinct ub.user_id from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
   where b.company_id = p_company
     and ( (p_type = 'company_admin' and ub.role = 'admin')
        or (p_type = 'role' and ub.role = p_ref) )
  union
  -- platform owners (assignees of platform_owner steps; also notified for platform_staff steps)
  select pr.id from erp_profiles pr
   where pr.is_platform_owner and p_type in ('platform_owner','platform_staff')
  union
  -- active platform staff holding the required permission (platform_staff steps)
  select s.profile_id from erp_platform_staff s
   where p_type = 'platform_staff' and p_ref is not null and s.is_active and (
     exists (select 1 from erp_platform_staff_permissions o
              where o.staff_id = s.id and o.permission = p_ref and o.effect = 'grant')
     or (
       exists (select 1 from erp_platform_role_permissions rp where rp.role = s.role and rp.permission = p_ref)
       and not exists (select 1 from erp_platform_staff_permissions o
                        where o.staff_id = s.id and o.permission = p_ref and o.effect = 'deny')
     )
   );
$$;

-- ── make_tasks: scope-aware notification deep-link ──────────────────────────
create or replace function erp_workflow_make_tasks(p_company uuid, p_instance uuid, p_step erp_workflow_steps)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_uid uuid; v_n int := 0; v_due timestamptz; v_ent text; v_rid text; v_link text;
begin
  v_due := case when p_step.sla_hours is not null then now() + (p_step.sla_hours || ' hours')::interval end;
  select entity, record_id into v_ent, v_rid from erp_workflow_instances where id = p_instance;
  v_link := case when p_step.approver_type in ('platform_owner','platform_staff') then '/platform/requests' else '/requests' end;
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
  for v_uid in select * from erp_workflow_resolve_users(p_company, p_step.approver_type, p_step.approver_ref) loop
    perform erp_notify(p_company, v_uid, 'workflow_task_assigned',
      'مهمة موافقة جديدة', 'New approval task', null, v_link, v_ent, v_rid);
  end loop;
end; $$;

-- ── Scope-aware RLS ──────────────────────────────────────────────────────────
drop policy if exists erp_wf_inst_read on erp_workflow_instances;
create policy erp_wf_inst_read on erp_workflow_instances for select using (
  (select erp_is_platform_owner())
  or (scope = 'company' and company_id = (select erp_user_company_id()))
  or (scope = 'platform' and ((select erp_is_platform_staff()) or started_by = (select auth.uid())))
);

drop policy if exists erp_wf_tasks_read on erp_workflow_tasks;
create policy erp_wf_tasks_read on erp_workflow_tasks for select using (
  (select erp_is_platform_owner())
  or exists (
    select 1 from erp_workflow_instances i
    where i.id = instance_id
      and ( (i.scope = 'company' and i.company_id = (select erp_user_company_id()))
         or (i.scope = 'platform' and (select erp_is_platform_staff())) )
  )
);

drop policy if exists erp_wfe_read on erp_workflow_events;
create policy erp_wfe_read on erp_workflow_events for select using (
  (select erp_is_platform_owner())
  or (scope = 'company' and company_id = (select erp_user_company_id()))
  or (scope = 'platform' and (
        (select erp_is_platform_staff())
        or exists (select 1 from erp_workflow_instances i where i.id = instance_id and i.started_by = (select auth.uid()))
     ))
);

-- ============================================================================
-- ROLLBACK (manual): restore the 0089/0090 bodies of erp_workflow_start,
-- erp_workflow_user_can_act, erp_workflow_resolve_users, erp_workflow_make_tasks,
-- and the 0088 read policies for instances/tasks (and the 0101 events policy).
-- No data changes; additive scope columns may remain.
-- ============================================================================
