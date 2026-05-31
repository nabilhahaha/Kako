-- ============================================================================
-- 0088: Workflow / Approval Engine — Phase 1 (Core Platform capability).
-- ----------------------------------------------------------------------------
-- Generic, ENTITY-AGNOSTIC multi-step approvals reused by every module. The
-- engine knows nothing about customers/POs/etc.: a definition targets a neutral
-- `entity` + `record_id`; the per-entity OUTCOME (what approval does) is applied
-- by an app-side handler registry. Transitions go through guarded SECURITY
-- DEFINER RPCs and are audit-logged. Phase 1 = sequential steps, quorum 1,
-- company_admin/user assignees. (Conditional routing, parallel/quorum, SLA
-- timers + pg_cron escalation, and the builder UI are later phases — columns are
-- present as extension points.) Additive + idempotent.
-- ============================================================================

-- Definition templates. company_id NULL = a global template usable by any
-- company (resolved as a fallback when no company-specific definition exists).
create table if not exists erp_workflow_definitions (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references erp_companies(id) on delete cascade,
  key         text not null,
  entity      text not null,
  name_ar     text,
  name_en     text,
  trigger     text not null default 'manual',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (company_id, key)
);

create table if not exists erp_workflow_steps (
  id               uuid primary key default gen_random_uuid(),
  definition_id    uuid not null references erp_workflow_definitions(id) on delete cascade,
  step_no          integer not null,
  name_ar          text,
  name_en          text,
  approver_type    text not null check (approver_type in ('company_admin','user','role','manager','department_head')),
  approver_ref     text,
  mode             text not null default 'sequential' check (mode in ('sequential','parallel')),
  required_approvals integer not null default 1,
  condition        jsonb,            -- conditional routing (Phase 2)
  sla_hours        integer,          -- SLA timer (Phase 3)
  escalate_to      text,             -- escalation target (Phase 3)
  unique (definition_id, step_no)
);

create table if not exists erp_workflow_instances (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  definition_id uuid not null references erp_workflow_definitions(id),
  entity        text not null,
  record_id     text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','escalated')),
  current_step  integer not null default 1,
  context       jsonb not null default '{}'::jsonb,
  started_by    uuid references erp_profiles(id) on delete set null,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index if not exists idx_wf_instances_company on erp_workflow_instances(company_id, status);
-- At most one active workflow per (entity, record) per company.
create unique index if not exists uq_wf_instance_active
  on erp_workflow_instances(company_id, entity, record_id) where status = 'pending';

create table if not exists erp_workflow_tasks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  instance_id   uuid not null references erp_workflow_instances(id) on delete cascade,
  step_no       integer not null,
  assignee_type text not null,
  assignee_ref  text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected','reassigned','expired')),
  due_at        timestamptz,
  decided_by    uuid references erp_profiles(id) on delete set null,
  decided_at    timestamptz,
  comment       text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_wf_tasks_instance on erp_workflow_tasks(instance_id);
create index if not exists idx_wf_tasks_company_status on erp_workflow_tasks(company_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table erp_workflow_definitions enable row level security;
alter table erp_workflow_steps        enable row level security;
alter table erp_workflow_instances    enable row level security;
alter table erp_workflow_tasks         enable row level security;

-- Definitions/steps: readable by any authenticated user (global templates +
-- own-company); writable by platform owner or the company's admin.
drop policy if exists erp_wf_def_read on erp_workflow_definitions;
create policy erp_wf_def_read on erp_workflow_definitions for select using (
  company_id is null or company_id = (select erp_user_company_id()) or (select erp_is_platform_owner())
);
drop policy if exists erp_wf_def_write on erp_workflow_definitions;
create policy erp_wf_def_write on erp_workflow_definitions for all using (
  (select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id)))
) with check (
  (select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id)))
);

drop policy if exists erp_wf_steps_read on erp_workflow_steps;
create policy erp_wf_steps_read on erp_workflow_steps for select using ((select auth.uid()) is not null);
drop policy if exists erp_wf_steps_write on erp_workflow_steps;
create policy erp_wf_steps_write on erp_workflow_steps for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- Instances/tasks: readable by the owning company; writes happen only through
-- the SECURITY DEFINER RPCs below (which bypass RLS), so the table write policy
-- stays owner-only as a backstop.
drop policy if exists erp_wf_inst_read on erp_workflow_instances;
create policy erp_wf_inst_read on erp_workflow_instances for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);
drop policy if exists erp_wf_inst_write on erp_workflow_instances;
create policy erp_wf_inst_write on erp_workflow_instances for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

drop policy if exists erp_wf_tasks_read on erp_workflow_tasks;
create policy erp_wf_tasks_read on erp_workflow_tasks for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);
drop policy if exists erp_wf_tasks_write on erp_workflow_tasks;
create policy erp_wf_tasks_write on erp_workflow_tasks for all
  using ((select erp_is_platform_owner())) with check ((select erp_is_platform_owner()));

-- ── Engine RPCs (SECURITY DEFINER; search_path pinned; anon revoked; audited) ─

-- Start a workflow for (entity, record_id). Resolves the company-specific
-- definition by key, else the global template. Creates the instance + the first
-- step's task(s). Returns the instance id.
create or replace function erp_workflow_start(
  p_key text, p_entity text, p_record_id text, p_context jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_company uuid := erp_user_company_id();
  v_def erp_workflow_definitions;
  v_step erp_workflow_steps;
  v_inst uuid;
begin
  if v_company is null then raise exception 'no company context'; end if;
  select * into v_def from erp_workflow_definitions
   where key = p_key and entity = p_entity and is_active
     and (company_id = v_company or company_id is null)
   order by (company_id is not null) desc limit 1;  -- prefer company-specific
  if v_def.id is null then raise exception 'no active workflow definition for %/%', p_key, p_entity; end if;

  select * into v_step from erp_workflow_steps where definition_id = v_def.id order by step_no limit 1;
  if v_step.id is null then raise exception 'workflow has no steps'; end if;

  insert into erp_workflow_instances(company_id, definition_id, entity, record_id, status, current_step, context, started_by)
  values (v_company, v_def.id, p_entity, p_record_id, 'pending', v_step.step_no, coalesce(p_context,'{}'::jsonb), auth.uid())
  returning id into v_inst;

  insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
  values (v_company, v_inst, v_step.step_no, v_step.approver_type, v_step.approver_ref,
          case when v_step.sla_hours is not null then now() + (v_step.sla_hours || ' hours')::interval end);

  perform erp_log_audit('start','workflow_instance', v_inst::text,
    jsonb_build_object('key',p_key,'entity',p_entity,'record_id',p_record_id), v_company);
  return v_inst;
end; $$;

-- Decide a task (approve/reject). Enforces the assignee (Phase 1: company_admin
-- or a specific user). On approve, advances to the next step (creating its
-- task) or completes the instance; on reject, completes as rejected. Returns
-- { final, status, entity, record_id } so the app can apply the outcome.
create or replace function erp_workflow_decide(
  p_task_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_task erp_workflow_tasks;
  v_inst erp_workflow_instances;
  v_next erp_workflow_steps;
  v_final boolean := false;
  v_status text;
begin
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;
  select * into v_task from erp_workflow_tasks where id = p_task_id;
  if v_task.id is null or v_task.status <> 'pending' then raise exception 'task not actionable'; end if;
  select * into v_inst from erp_workflow_instances where id = v_task.instance_id;
  if v_inst.status <> 'pending' then raise exception 'workflow not active'; end if;

  -- Authorization (Phase 1): company admin, or the specifically-assigned user.
  if not (
    (v_task.assignee_type = 'company_admin' and (select erp_is_company_admin(v_inst.company_id)))
    or (v_task.assignee_type = 'user' and v_task.assignee_ref = auth.uid()::text)
    or (select erp_is_platform_owner())
  ) then
    raise exception 'not authorized to decide this task';
  end if;

  update erp_workflow_tasks
     set status = case when p_decision='approve' then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), comment = p_comment
   where id = p_task_id;

  if p_decision = 'reject' then
    update erp_workflow_instances set status='rejected', completed_at=now() where id=v_inst.id;
    v_final := true; v_status := 'rejected';
  else
    select * into v_next from erp_workflow_steps
      where definition_id = v_inst.definition_id and step_no > v_inst.current_step
      order by step_no limit 1;
    if v_next.id is null then
      update erp_workflow_instances set status='approved', completed_at=now() where id=v_inst.id;
      v_final := true; v_status := 'approved';
    else
      update erp_workflow_instances set current_step = v_next.step_no where id=v_inst.id;
      insert into erp_workflow_tasks(company_id, instance_id, step_no, assignee_type, assignee_ref, due_at)
      values (v_inst.company_id, v_inst.id, v_next.step_no, v_next.approver_type, v_next.approver_ref,
              case when v_next.sla_hours is not null then now() + (v_next.sla_hours || ' hours')::interval end);
      v_status := 'pending';
    end if;
  end if;

  perform erp_log_audit('decide','workflow_task', p_task_id::text,
    jsonb_build_object('decision',p_decision,'final',v_final,'instance',v_inst.id), v_inst.company_id);
  return jsonb_build_object('final', v_final, 'status', v_status, 'entity', v_inst.entity, 'record_id', v_inst.record_id);
end; $$;

revoke all on function erp_workflow_start(text,text,text,jsonb) from public, anon;
revoke all on function erp_workflow_decide(uuid,text,text) from public, anon;
grant execute on function erp_workflow_start(text,text,text,jsonb) to authenticated;
grant execute on function erp_workflow_decide(uuid,text,text) to authenticated;

-- ── Seed: a GLOBAL Customer Onboarding workflow (one step: company admin) ────
insert into erp_workflow_definitions(company_id, key, entity, name_ar, name_en)
values (null, 'customer_onboarding', 'customer', 'اعتماد عميل جديد', 'Customer onboarding')
on conflict do nothing;
insert into erp_workflow_steps(definition_id, step_no, name_ar, name_en, approver_type)
select id, 1, 'موافقة المدير', 'Manager approval', 'company_admin'
  from erp_workflow_definitions where key='customer_onboarding' and company_id is null
on conflict (definition_id, step_no) do nothing;
