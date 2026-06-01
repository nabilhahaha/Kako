-- ============================================================================
-- 0101: Generic Workflow & Approval Engine — foundation extensions
-- ----------------------------------------------------------------------------
-- Extends the existing engine (0088–0090) for the approved design, WITHOUT a
-- rewrite. All changes are additive + idempotent and preserve current behaviour
-- (existing definitions default to scope='company'):
--   • definitions: scope (company|platform), category, versioning, entry condition
--   • steps: platform approver types, delegation flag, reject behaviour
--   • instances: scope (denormalized), priority
--   • tasks: delegation trail
--   • notifications: channel (in_app|email|whatsapp) for future fan-out
--   • erp_workflow_events: an append-only per-instance timeline
--   • engine-level AUDIT: triggers write erp_workflow_events + erp_audit_logs on
--     every instance/task transition (caller-agnostic — closes the audit gap).
-- ============================================================================

-- ── Definitions: scope, category, versioning, entry condition ────────────────
alter table erp_workflow_definitions add column if not exists scope text not null default 'company';
alter table erp_workflow_definitions drop constraint if exists erp_workflow_definitions_scope_check;
alter table erp_workflow_definitions add constraint erp_workflow_definitions_scope_check
  check (scope in ('company','platform'));
alter table erp_workflow_definitions add column if not exists category text;
alter table erp_workflow_definitions add column if not exists version integer not null default 1;
alter table erp_workflow_definitions add column if not exists is_latest boolean not null default true;
alter table erp_workflow_definitions add column if not exists applies_when jsonb;

-- ── Steps: platform approver types + delegation + reject behaviour ───────────
alter table erp_workflow_steps drop constraint if exists erp_workflow_steps_approver_type_check;
alter table erp_workflow_steps add constraint erp_workflow_steps_approver_type_check
  check (approver_type in ('company_admin','user','role','manager','department_head','platform_owner','platform_staff'));
alter table erp_workflow_steps add column if not exists allow_delegate boolean not null default false;
alter table erp_workflow_steps add column if not exists on_reject text not null default 'fail';
alter table erp_workflow_steps drop constraint if exists erp_workflow_steps_on_reject_check;
alter table erp_workflow_steps add constraint erp_workflow_steps_on_reject_check
  check (on_reject in ('fail','return_prev','continue'));

-- ── Instances: scope (denormalized for filtering/RLS) + priority ─────────────
alter table erp_workflow_instances add column if not exists scope text not null default 'company';
alter table erp_workflow_instances drop constraint if exists erp_workflow_instances_scope_check;
alter table erp_workflow_instances add constraint erp_workflow_instances_scope_check
  check (scope in ('company','platform'));
alter table erp_workflow_instances add column if not exists priority text not null default 'normal';
alter table erp_workflow_instances drop constraint if exists erp_workflow_instances_priority_check;
alter table erp_workflow_instances add constraint erp_workflow_instances_priority_check
  check (priority in ('normal','high'));

-- ── Tasks: delegation trail ──────────────────────────────────────────────────
alter table erp_workflow_tasks add column if not exists delegated_from uuid references erp_profiles(id) on delete set null;
alter table erp_workflow_tasks add column if not exists delegated_to   uuid references erp_profiles(id) on delete set null;

-- ── Notifications: channel (future email / WhatsApp fan-out) ─────────────────
alter table erp_notifications add column if not exists channel text not null default 'in_app';
alter table erp_notifications drop constraint if exists erp_notifications_channel_check;
alter table erp_notifications add constraint erp_notifications_channel_check
  check (channel in ('in_app','email','whatsapp'));

-- ── Events: append-only per-instance timeline ────────────────────────────────
create table if not exists erp_workflow_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references erp_companies(id) on delete cascade,
  instance_id uuid not null references erp_workflow_instances(id) on delete cascade,
  scope       text not null default 'company',
  event       text not null,                 -- submitted | decided | status_changed | reassigned | expired
  step_no     integer,
  actor_id    uuid references erp_profiles(id) on delete set null,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_wf_events_instance on erp_workflow_events(instance_id, created_at);

alter table erp_workflow_events enable row level security;
-- Read: platform owner (all) or the subject company's members. Platform-staff
-- read of platform-scope events is added with the platform inbox (Phase B).
-- Inserts happen only via the SECURITY DEFINER triggers below (no user policy).
drop policy if exists erp_wfe_read on erp_workflow_events;
create policy erp_wfe_read on erp_workflow_events for select
  using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

-- ── Engine-level audit: events + erp_audit_logs on every transition ──────────
-- Caller-agnostic, so audit is consistent regardless of which RPC/code drives it.
create or replace function erp_workflow_on_instance()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if tg_op = 'INSERT' then
    insert into erp_workflow_events(company_id, instance_id, scope, event, step_no, actor_id, detail)
      values (NEW.company_id, NEW.id, NEW.scope, 'submitted', NEW.current_step, NEW.started_by,
              jsonb_build_object('entity', NEW.entity, 'record_id', NEW.record_id));
    perform erp_log_audit('submit', 'workflow_instance', NEW.id::text,
      jsonb_build_object('entity', NEW.entity, 'scope', NEW.scope), NEW.company_id);
  elsif tg_op = 'UPDATE' and NEW.status is distinct from OLD.status then
    insert into erp_workflow_events(company_id, instance_id, scope, event, step_no, actor_id, detail)
      values (NEW.company_id, NEW.id, NEW.scope, 'status_changed', NEW.current_step, auth.uid(),
              jsonb_build_object('from', OLD.status, 'to', NEW.status));
    perform erp_log_audit(NEW.status, 'workflow_instance', NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'entity', NEW.entity), NEW.company_id);
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_wf_instance on erp_workflow_instances;
create trigger trg_wf_instance after insert or update on erp_workflow_instances
  for each row execute function erp_workflow_on_instance();

create or replace function erp_workflow_on_task()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_scope text;
begin
  if tg_op = 'UPDATE' and NEW.status is distinct from OLD.status
     and NEW.status in ('approved','rejected','reassigned','expired') then
    select scope into v_scope from erp_workflow_instances where id = NEW.instance_id;
    insert into erp_workflow_events(company_id, instance_id, scope, event, step_no, actor_id, detail)
      values (NEW.company_id, NEW.instance_id, coalesce(v_scope,'company'),
              case when NEW.status in ('approved','rejected') then 'decided' else NEW.status end,
              NEW.step_no, NEW.decided_by,
              jsonb_build_object('status', NEW.status, 'comment', NEW.comment));
    perform erp_log_audit(
      case when NEW.status='approved' then 'approve'
           when NEW.status='rejected' then 'reject' else NEW.status end,
      'workflow_task', NEW.id::text,
      jsonb_build_object('step', NEW.step_no, 'comment', NEW.comment), NEW.company_id);
  end if;
  return NEW;
end; $$;

drop trigger if exists trg_wf_task on erp_workflow_tasks;
create trigger trg_wf_task after update on erp_workflow_tasks
  for each row execute function erp_workflow_on_task();

-- ============================================================================
-- ROLLBACK (manual; NOT auto-applied):
--   drop trigger trg_wf_instance on erp_workflow_instances;
--   drop trigger trg_wf_task on erp_workflow_tasks;
--   drop function erp_workflow_on_instance();
--   drop function erp_workflow_on_task();
--   drop table erp_workflow_events;
--   (added columns/constraints are additive and may be left in place safely.)
-- ============================================================================
