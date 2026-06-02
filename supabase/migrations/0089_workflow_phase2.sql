-- ============================================================================
-- 0089: Workflow / Approval Engine — Phase 2.
-- ----------------------------------------------------------------------------
-- Adds, on the same entity-agnostic engine: CONDITIONAL routing (skip steps
-- whose condition fails against the instance context), PARALLEL approvals with
-- QUORUM (required_approvals) and ANY-REJECT-FAILS, and richer assignee
-- resolution (company_admin / user / role). Proof entity: Credit Limit Approval
-- (threshold-based, multi-step, finance review). Builder-lite UI manages
-- company definitions. Additive + idempotent. (SLA timers / pg_cron escalation /
-- notifications remain deferred to Phase 3.)
-- ============================================================================

-- ── Credit-limit change requests (the Phase-2 proof entity) ──────────────────
create table if not exists erp_credit_limit_requests (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references erp_companies(id) on delete cascade,
  customer_id    uuid not null references erp_customers(id) on delete cascade,
  current_limit  numeric,
  requested_limit numeric not null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by     uuid references erp_profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_clr_company on erp_credit_limit_requests(company_id, status);
alter table erp_credit_limit_requests enable row level security;
drop policy if exists erp_clr_read on erp_credit_limit_requests;
create policy erp_clr_read on erp_credit_limit_requests for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);
drop policy if exists erp_clr_insert on erp_credit_limit_requests;
create policy erp_clr_insert on erp_credit_limit_requests for insert with check (
  company_id = (select erp_user_company_id())
);
drop policy if exists erp_clr_update on erp_credit_limit_requests;
create policy erp_clr_update on erp_credit_limit_requests for update using (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
) with check (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
);
drop trigger if exists erp_clr_set_company on erp_credit_limit_requests;
create trigger erp_clr_set_company before insert on erp_credit_limit_requests
  for each row execute function erp_org_set_company();

-- ── Engine helpers ───────────────────────────────────────────────────────────

-- Evaluate a step's condition rule {when, op, value} against the instance
-- context. Null/empty rule ⇒ always applicable.
create or replace function erp_workflow_condition_met(p_cond jsonb, p_ctx jsonb)
returns boolean language plpgsql immutable as $$
declare w text; op text; vtxt text; actual text;
begin
  if p_cond is null or p_cond = '{}'::jsonb or (p_cond->>'when') is null then return true; end if;
  w := p_cond->>'when'; op := coalesce(p_cond->>'op','eq'); vtxt := p_cond->>'value';
  actual := (coalesce(p_ctx,'{}'::jsonb))->>w;
  if op = 'eq'  then return coalesce(actual,'') = coalesce(vtxt,''); end if;
  if op = 'neq' then return coalesce(actual,'') <> coalesce(vtxt,''); end if;
  if op = 'gt'  then return actual is not null and vtxt is not null and actual::numeric >  vtxt::numeric; end if;
  if op = 'lt'  then return actual is not null and vtxt is not null and actual::numeric <  vtxt::numeric; end if;
  if op = 'in'  then return actual in (select jsonb_array_elements_text(p_cond->'value')); end if;
  return true;
end; $$;

-- Resolve a step's assignees to user ids (for parallel fan-out). company_admin →
-- company admins; role → users holding that role in the company; user → that id.
create or replace function erp_workflow_resolve_users(p_company uuid, p_type text, p_ref text)
returns setof uuid language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select p_ref::uuid where p_type = 'user' and p_ref is not null
  union
  select distinct ub.user_id from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
   where b.company_id = p_company
     and ( (p_type = 'company_admin' and ub.role = 'admin')
        or (p_type = 'role' and ub.role = p_ref) );
$$;

-- Does the current user satisfy a (sequential) task's assignee?
create or replace function erp_workflow_user_can_act(p_company uuid, p_type text, p_ref text)
returns boolean language sql stable security definer
set search_path to 'public','pg_temp' as $$
  select (select erp_is_platform_owner())
      or (p_type = 'company_admin' and (select erp_is_company_admin(p_company)))
      or (p_type = 'user' and p_ref = auth.uid()::text)
      or (p_type = 'role' and exists (
            select 1 from erp_user_branches ub join erp_branches b on b.id = ub.branch_id
            where b.company_id = p_company and ub.user_id = auth.uid() and ub.role = p_ref));
$$;

-- Create the task(s) for a step: one for sequential (claimable by the assignee
-- type), or one per resolved user for parallel.
create or replace function erp_workflow_make_tasks(p_company uuid, p_instance uuid, p_step erp_workflow_steps)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_uid uuid; v_n int := 0; v_due timestamptz;
begin
  v_due := case when p_step.sla_hours is not null then now() + (p_step.sla_hours || ' hours')::interval end;
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
end; $$;

-- ── Rewritten start: enter the first APPLICABLE step (conditional routing) ───
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

  insert into erp_workflow_instances(company_id, definition_id, entity, record_id, status, current_step, context, started_by)
  values (v_company, v_def.id, p_entity, p_record_id, 'pending', 0, v_ctx, auth.uid())
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

-- ── Rewritten decide: quorum + any-reject-fails + conditional next step ──────
create or replace function erp_workflow_decide(
  p_task_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_task erp_workflow_tasks;
  v_inst erp_workflow_instances;
  v_cur  erp_workflow_steps;
  v_next erp_workflow_steps;
  v_step erp_workflow_steps;
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

  update erp_workflow_tasks
     set status = case when p_decision='approve' then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), comment = p_comment
   where id = p_task_id;

  if p_decision = 'reject' then
    -- Any reject fails the whole instance; expire its remaining pending tasks.
    update erp_workflow_instances set status='rejected', completed_at=now() where id=v_inst.id;
    update erp_workflow_tasks set status='expired' where instance_id=v_inst.id and status='pending';
    v_final := true; v_status := 'rejected';
  else
    select * into v_cur from erp_workflow_steps
      where definition_id=v_inst.definition_id and step_no=v_inst.current_step;
    select count(*) into v_approved from erp_workflow_tasks
      where instance_id=v_inst.id and step_no=v_inst.current_step and status='approved';

    if v_approved >= coalesce(v_cur.required_approvals,1) then
      -- Step complete: expire remaining pending tasks of this step, then route.
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
    end if; -- else quorum not yet met → still pending
  end if;

  perform erp_log_audit('decide','workflow_task', p_task_id::text,
    jsonb_build_object('decision',p_decision,'final',v_final,'instance',v_inst.id), v_inst.company_id);
  return jsonb_build_object('final', v_final, 'status', v_status, 'entity', v_inst.entity, 'record_id', v_inst.record_id);
end; $$;

revoke all on function erp_workflow_condition_met(jsonb,jsonb) from public, anon, authenticated;
revoke all on function erp_workflow_resolve_users(uuid,text,text) from public, anon, authenticated;
revoke all on function erp_workflow_user_can_act(uuid,text,text) from public, anon, authenticated;
revoke all on function erp_workflow_make_tasks(uuid,uuid,erp_workflow_steps) from public, anon, authenticated;
revoke all on function erp_workflow_start(text,text,text,jsonb) from public, anon;
revoke all on function erp_workflow_decide(uuid,text,text) from public, anon;
grant execute on function erp_workflow_start(text,text,text,jsonb) to authenticated;
grant execute on function erp_workflow_decide(uuid,text,text) to authenticated;

-- Builder-lite: company admins manage steps of THEIR OWN definitions (global
-- templates stay owner-only). Widen the 0088 owner-only step-write policy.
drop policy if exists erp_wf_steps_write on erp_workflow_steps;
create policy erp_wf_steps_write on erp_workflow_steps for all using (
  (select erp_is_platform_owner())
  or exists (select 1 from erp_workflow_definitions d
             where d.id = definition_id and d.company_id is not null and (select erp_is_company_admin(d.company_id)))
) with check (
  (select erp_is_platform_owner())
  or exists (select 1 from erp_workflow_definitions d
             where d.id = definition_id and d.company_id is not null and (select erp_is_company_admin(d.company_id)))
);

-- ── Seed: a GLOBAL Credit Limit Approval workflow ───────────────────────────
-- Step 1 manager (company admin) always; Step 2 senior review for large limits
-- (amount > 50000) — demonstrates conditional, threshold-based, multi-step.
insert into erp_workflow_definitions(company_id, key, entity, name_ar, name_en)
values (null, 'credit_limit_approval', 'credit_limit_request', 'اعتماد حد ائتمان', 'Credit limit approval')
on conflict do nothing;
insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, mode, required_approvals, condition)
select id, 1, 'موافقة المدير', 'Manager approval', 'company_admin', 'sequential', 1, null
  from erp_workflow_definitions where key='credit_limit_approval' and company_id is null
on conflict (definition_id, step_no) do nothing;
insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type, mode, required_approvals, condition)
select id, 2, 'مراجعة الإدارة العليا', 'Senior review', 'company_admin', 'sequential', 1,
       '{"when":"amount","op":"gt","value":"50000"}'::jsonb
  from erp_workflow_definitions where key='credit_limit_approval' and company_id is null
on conflict (definition_id, step_no) do nothing;
