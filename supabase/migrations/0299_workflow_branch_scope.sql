-- ============================================================================
-- 0299: Approval engine — branch-scoped approver resolution (P1b)
-- ----------------------------------------------------------------------------
-- ADDITIVE + idempotent + DORMANT. A step may opt into branch scope; when set,
-- its approvers are resolved to the specific users who hold the role/permission
-- IN THE REQUEST'S BRANCH (erp_workflow_instances.branch_id) and assigned as
-- 'user' tasks. Because the resulting tasks are plain 'user' tasks, the decide
-- RPC is UNCHANGED (it already authorises 'user' tasks) — no live decision path
-- is touched. No existing step sets branch_scoped, so behaviour is unchanged.
--
-- Rollback: alter table ... drop column branch_scoped; restore the prior
-- erp_workflow_make_tasks (re-apply 0089/live). No data affected.
-- ============================================================================

alter table erp_workflow_steps
  add column if not exists branch_scoped boolean not null default false;
comment on column erp_workflow_steps.branch_scoped is
  'When true, approvers are resolved within the request''s branch (instance.branch_id).';

-- Branch-restricted resolver: same role/permission/company_admin logic as
-- erp_workflow_resolve_users, but limited to a single branch. 'user' is returned
-- as-is (a named user is not branch-filtered).
create or replace function erp_workflow_resolve_users_in_branch(
  p_company uuid, p_type text, p_ref text, p_branch uuid)
returns setof uuid language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select p_ref::uuid where p_type = 'user' and p_ref is not null
  union
  select distinct ub.user_id
    from erp_user_branches ub
   where ub.branch_id = p_branch
     and ( (p_type = 'company_admin' and ub.role = 'admin')
        or (p_type = 'role' and ub.role = p_ref) )
  union
  select distinct ub.user_id
    from erp_user_branches ub
   where p_type = 'permission' and p_ref is not null and ub.branch_id = p_branch
     and (
       exists (select 1 from erp_company_role_permissions crp
                where crp.company_id = p_company and crp.role_key = ub.role and crp.permission = p_ref)
       or (
         not exists (select 1 from erp_company_role_permissions crp2
                      where crp2.company_id = p_company and crp2.role_key = ub.role)
         and exists (select 1 from erp_role_permissions rp
                      where rp.role_key = ub.role and rp.permission = p_ref)
       )
     );
$$;

-- make_tasks: faithful superset of the live function + a branch-scoped branch.
-- When the step is branch_scoped and the instance has a branch, fan out to the
-- in-branch approvers as 'user' tasks (so decide stays unchanged); else the
-- existing parallel / sequential behaviour.
create or replace function erp_workflow_make_tasks(p_company uuid, p_instance uuid, p_step erp_workflow_steps)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_uid uuid; v_n int := 0; v_due timestamptz; v_ent text; v_rid text; v_branch uuid;
begin
  v_due := case when p_step.sla_hours is not null then now() + (p_step.sla_hours || ' hours')::interval end;
  select entity, record_id, branch_id into v_ent, v_rid, v_branch from erp_workflow_instances where id = p_instance;

  if p_step.branch_scoped and v_branch is not null then
    for v_uid in select * from erp_workflow_resolve_users_in_branch(p_company, p_step.approver_type, p_step.approver_ref, v_branch) loop
      insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
      values (p_company, p_instance, p_step.step_no, 'user', v_uid::text, v_due);
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'no approvers resolved for branch-scoped step %', p_step.step_no; end if;
    for v_uid in select * from erp_workflow_resolve_users_in_branch(p_company, p_step.approver_type, p_step.approver_ref, v_branch) loop
      perform erp_notify(p_company, v_uid, 'workflow_task_assigned', 'مهمة موافقة جديدة', 'New approval task', null, '/approvals', v_ent, v_rid);
    end loop;
    return;
  end if;

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
    perform erp_notify(p_company, v_uid, 'workflow_task_assigned', 'مهمة موافقة جديدة', 'New approval task', null, '/approvals', v_ent, v_rid);
  end loop;
end; $$;

-- start: faithful superset that ALSO records the instance branch from context
-- (context.branch_id). Additive: callers that don't pass branch_id behave
-- exactly as before (branch_id stays null ⇒ branch scope inert). Branch-scoped
-- workflows pass { "branch_id": "<uuid>" } in p_context to enable in-branch
-- approver resolution.
create or replace function erp_workflow_start(
  p_key text, p_entity text, p_record_id text, p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_def erp_workflow_definitions; v_step erp_workflow_steps; v_inst uuid; v_ctx jsonb := coalesce(p_context,'{}'::jsonb); v_started boolean := false;
begin
  if v_company is null then raise exception 'no company context'; end if;
  select * into v_def from erp_workflow_definitions where key = p_key and entity = p_entity and is_active and (company_id = v_company or company_id is null) order by (company_id is not null) desc limit 1;
  if v_def.id is null then raise exception 'no active workflow definition for %/%', p_key, p_entity; end if;
  insert into erp_workflow_instances(company_id, definition_id, entity, record_id, status, current_step, context, started_by, branch_id)
  values (v_company, v_def.id, p_entity, p_record_id, 'pending', 0, v_ctx, auth.uid(), nullif(v_ctx->>'branch_id','')::uuid)
  returning id into v_inst;
  for v_step in select * from erp_workflow_steps where definition_id = v_def.id order by step_no loop
    if erp_workflow_condition_met(v_step.condition, v_ctx) then
      update erp_workflow_instances set current_step = v_step.step_no where id = v_inst;
      perform erp_workflow_make_tasks(v_company, v_inst, v_step);
      v_started := true;
      exit;
    end if;
  end loop;
  if not v_started then update erp_workflow_instances set status='approved', completed_at=now() where id=v_inst; end if;
  perform erp_log_audit('start','workflow_instance', v_inst::text, jsonb_build_object('key',p_key,'entity',p_entity,'record_id',p_record_id,'auto_approved',not v_started), v_company);
  return v_inst;
end; $$;
