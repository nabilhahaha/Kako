-- ============================================================================
-- 0107: Workflow Engine — Customer Route Ownership & subject-anchored approvers
-- ----------------------------------------------------------------------------
-- Adds owner-based approver resolution, reusing existing structures
-- (erp_customers.salesman_id / route_id, erp_routes.rep_id, reports_to). No new
-- core tables. Additive; existing definitions untouched.
--   • account_owner  → the subject customer's salesman_id (core; any company).
--   • route_owner    → customer.route_id → erp_routes.rep_id, gated by the
--                      `distribution` module (FMCG pack). Optional per company.
--   • Graceful fallback: Route Owner → Account Owner → Branch Manager → Company.
--   • Subject-anchored hierarchy: manager / department_head follow the reports_to
--     chain of the request's SUBJECT OWNER (when present) instead of the
--     requester — so "Route Owner → reports_to chain" works.
--   • Resolved to concrete users at task creation → a route-owner change affects
--     NEW requests while in-flight requests keep their resolved approvers.
-- Tenant isolation preserved (company-scoped joins).
-- ============================================================================

-- Map a workflow subject (entity + record) to its customer id. Extensible.
create or replace function erp_workflow_subject_customer(p_entity text, p_record_id text)
returns uuid language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_cust uuid;
begin
  if p_record_id is null then return null; end if;
  if p_entity = 'customer' then
    return p_record_id::uuid;
  elsif p_entity = 'credit_limit_request' then
    select customer_id into v_cust from erp_credit_limit_requests where id = p_record_id::uuid;
    return v_cust;
  end if;
  return null;  -- platform / non-customer entities have no subject customer
end; $$;
revoke all on function erp_workflow_subject_customer(text,text) from public, anon, authenticated;

-- Resolve the owning user for a subject customer, with graceful fallback:
--   route_owner  → (distribution enabled & route set) route.rep_id
--                  → customer.salesman_id → branch manager
--   account_owner→ customer.salesman_id → branch manager
create or replace function erp_workflow_resolve_owner(p_company uuid, p_type text, p_customer uuid)
returns uuid language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_owner uuid; v_route uuid; v_sales uuid; v_dist boolean;
begin
  if p_customer is null then return null; end if;
  select salesman_id, route_id into v_sales, v_route
    from erp_customers where id = p_customer and company_id = p_company;

  if p_type = 'route_owner' then
    select coalesce((select enabled from erp_company_modules
                      where company_id = p_company and module = 'distribution'), false) into v_dist;
    if v_dist and v_route is not null then
      select rep_id into v_owner from erp_routes where id = v_route and company_id = p_company;
    end if;
  end if;

  if v_owner is null then v_owner := v_sales; end if;          -- account-owner fallback
  if v_owner is null then                                       -- branch-manager fallback
    select ub.user_id into v_owner
      from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
     where b.company_id = p_company and ub.role = 'manager'
     limit 1;
  end if;
  return v_owner;
end; $$;
revoke all on function erp_workflow_resolve_owner(uuid,text,uuid) from public, anon, authenticated;

-- start (re-defined): stash the subject owner on the instance context so
-- downstream manager/department_head steps can anchor on the owner.
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
  v_customer uuid;
  v_owner uuid;
begin
  if v_company is null then raise exception 'no company context'; end if;
  select * into v_def from erp_workflow_definitions
   where key = p_key and entity = p_entity and is_active and (company_id = v_company or company_id is null)
   order by (company_id is not null) desc limit 1;
  if v_def.id is null then raise exception 'no active workflow definition for %/%', p_key, p_entity; end if;

  -- Compute the subject owner (route → account → manager) and anchor it.
  v_customer := erp_workflow_subject_customer(p_entity, p_record_id);
  if v_customer is not null then
    v_owner := erp_workflow_resolve_owner(v_company, 'route_owner', v_customer);
    if v_owner is not null then
      v_ctx := jsonb_set(v_ctx, '{owner_user_id}', to_jsonb(v_owner::text), true);
    end if;
  end if;

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

-- make_tasks (re-defined): add account_owner / route_owner resolution and anchor
-- manager/department_head on the subject owner (context.owner_user_id) when set.
create or replace function erp_workflow_make_tasks(p_company uuid, p_instance uuid, p_step erp_workflow_steps)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_uid uuid; v_n int := 0; v_due timestamptz;
  v_ent text; v_rid text; v_link text; v_starter uuid; v_ctx jsonb;
  v_anchor uuid; v_customer uuid; v_owner uuid;
begin
  v_due := case when p_step.sla_hours is not null then now() + (p_step.sla_hours || ' hours')::interval end;
  select entity, record_id, started_by, context into v_ent, v_rid, v_starter, v_ctx
    from erp_workflow_instances where id = p_instance;
  v_link := case when p_step.approver_type in ('platform_owner','platform_staff') then '/platform/requests' else '/requests' end;
  v_anchor := coalesce(nullif(v_ctx->>'owner_user_id','')::uuid, v_starter);

  if p_step.approver_type in ('account_owner','route_owner') then
    v_customer := erp_workflow_subject_customer(v_ent, v_rid);
    v_owner := erp_workflow_resolve_owner(p_company, p_step.approver_type, v_customer);
    if v_owner is null then raise exception 'no % resolved for step %', p_step.approver_type, p_step.step_no; end if;
    insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
    values (p_company, p_instance, p_step.step_no, 'user', v_owner::text, v_due);
    perform erp_notify(p_company, v_owner, 'workflow_task_assigned',
      'مهمة موافقة جديدة', 'New approval task', null, v_link, v_ent, v_rid);

  elsif p_step.approver_type in ('manager','department_head') then
    for v_uid in select * from erp_workflow_resolve_hierarchy(p_company, p_step.approver_type, v_anchor) loop
      insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
      values (p_company, p_instance, p_step.step_no, 'user', v_uid::text, v_due);
      v_n := v_n + 1;
    end loop;
    if v_n = 0 then raise exception 'no % resolved for step %', p_step.approver_type, p_step.step_no; end if;
    for v_uid in select * from erp_workflow_resolve_hierarchy(p_company, p_step.approver_type, v_anchor) loop
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

-- Allow account_owner / route_owner on steps (extend the check constraint).
alter table erp_workflow_steps drop constraint if exists erp_workflow_steps_approver_type_check;
alter table erp_workflow_steps add constraint erp_workflow_steps_approver_type_check
  check (approver_type in ('company_admin','user','role','manager','department_head',
                           'platform_owner','platform_staff','account_owner','route_owner'));

-- ============================================================================
-- ROLLBACK (manual): drop erp_workflow_subject_customer, erp_workflow_resolve_owner;
-- restore the 0107->0103/0102 bodies of make_tasks/start; restore the prior
-- approver_type check. No data changes.
-- ============================================================================
