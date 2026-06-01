-- ============================================================================
-- 0103: Workflow Engine — hierarchical approvers (manager / department_head)
-- ----------------------------------------------------------------------------
-- Makes the already-declared `manager` and `department_head` approver types
-- functional, using the EXISTING org hierarchy (0009 reports_to, 0077
-- departments + department_id). No engine/workflow redesign, no signature
-- changes to user_can_act/resolve_users, existing definitions untouched.
--
-- Approach: these approvers are RELATIVE TO THE REQUESTER, so they are resolved
-- to concrete user ids at task-creation time (exactly like the existing parallel
-- path) and stored as 'user' tasks — so erp_workflow_user_can_act needs no
-- change. Works for both sequential and parallel chains (the step's mode +
-- required_approvals still govern the resolved user tasks). Company-scoped joins
-- preserve tenant isolation.
-- ============================================================================

-- Resolve the requester's manager(s) or department head(s) within their company.
--   manager:         erp_user_branches.reports_to; fallback = branch role='manager'
--   department_head: erp_departments.manager_id of the requester's department(s)
create or replace function erp_workflow_resolve_hierarchy(p_company uuid, p_type text, p_requester uuid)
returns setof uuid language sql stable security definer
set search_path to 'public','pg_temp' as $$
  -- direct manager(s) via the reporting line
  select distinct ub.reports_to
    from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
   where p_type = 'manager' and ub.user_id = p_requester and b.company_id = p_company
     and ub.reports_to is not null
  union
  -- fallback: branch manager(s) when the requester has no explicit reporting line
  select distinct m.user_id
    from erp_user_branches req join erp_branches b on b.id = req.branch_id
    join erp_user_branches m on m.branch_id = req.branch_id and m.role = 'manager'
   where p_type = 'manager' and req.user_id = p_requester and b.company_id = p_company
     and m.user_id <> p_requester
     and not exists (
       select 1 from erp_user_branches u2 join erp_branches b2 on b2.id = u2.branch_id
        where u2.user_id = p_requester and b2.company_id = p_company and u2.reports_to is not null)
  union
  -- department head(s): the manager of the requester's department(s)
  select distinct d.manager_id
    from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
    join erp_departments d on d.id = ub.department_id
   where p_type = 'department_head' and ub.user_id = p_requester and b.company_id = p_company
     and d.manager_id is not null and d.manager_id <> p_requester;
$$;
revoke all on function erp_workflow_resolve_hierarchy(uuid,text,uuid) from public, anon, authenticated;

-- make_tasks (re-defined): resolve manager/department_head to concrete users
-- (relative to the instance's requester) and create 'user' tasks; otherwise keep
-- the existing parallel/sequential behaviour. Scope-aware notification link.
create or replace function erp_workflow_make_tasks(p_company uuid, p_instance uuid, p_step erp_workflow_steps)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_uid uuid; v_n int := 0; v_due timestamptz;
  v_ent text; v_rid text; v_link text; v_starter uuid; v_hier boolean;
begin
  v_due := case when p_step.sla_hours is not null then now() + (p_step.sla_hours || ' hours')::interval end;
  select entity, record_id, started_by into v_ent, v_rid, v_starter from erp_workflow_instances where id = p_instance;
  v_link := case when p_step.approver_type in ('platform_owner','platform_staff') then '/platform/requests' else '/requests' end;
  v_hier := p_step.approver_type in ('manager','department_head');

  if v_hier then
    -- hierarchical: resolve to concrete users (relative to the requester)
    for v_uid in select * from erp_workflow_resolve_hierarchy(p_company, p_step.approver_type, v_starter) loop
      insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
      values (p_company, p_instance, p_step.step_no, 'user', v_uid::text, v_due);
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'no % resolved for step %', p_step.approver_type, p_step.step_no; end if;
    for v_uid in select * from erp_workflow_resolve_hierarchy(p_company, p_step.approver_type, v_starter) loop
      perform erp_notify(p_company, v_uid, 'workflow_task_assigned',
        'مهمة موافقة جديدة', 'New approval task', null, v_link, v_ent, v_rid);
    end loop;
  elsif p_step.mode = 'parallel' then
    for v_uid in select * from erp_workflow_resolve_users(p_company, p_step.approver_type, p_step.approver_ref) loop
      insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
      values (p_company, p_instance, p_step.step_no, 'user', v_uid::text, v_due);
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'no approvers resolved for parallel step %', p_step.step_no; end if;
    for v_uid in select * from erp_workflow_resolve_users(p_company, p_step.approver_type, p_step.approver_ref) loop
      perform erp_notify(p_company, v_uid, 'workflow_task_assigned',
        'مهمة موافقة جديدة', 'New approval task', null, v_link, v_ent, v_rid);
    end loop;
  else
    insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
    values (p_company, p_instance, p_step.step_no, p_step.approver_type, p_step.approver_ref, v_due);
    for v_uid in select * from erp_workflow_resolve_users(p_company, p_step.approver_type, p_step.approver_ref) loop
      perform erp_notify(p_company, v_uid, 'workflow_task_assigned',
        'مهمة موافقة جديدة', 'New approval task', null, v_link, v_ent, v_rid);
    end loop;
  end if;
end; $$;

-- ============================================================================
-- ROLLBACK (manual): drop erp_workflow_resolve_hierarchy(uuid,text,uuid) and
-- restore the 0102 body of erp_workflow_make_tasks. No data changes.
-- ============================================================================
