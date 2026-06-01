-- ============================================================================
-- 0108: Platform Foundation #1 — Audit Trail Engine
-- ----------------------------------------------------------------------------
-- Uniform, queryable record of every create/update/delete/approval/status
-- change, with BEFORE/AFTER values, actor, timestamp, and workflow/approval
-- reference. Additive over erp_audit_logs (0024); reuses erp_workflow_events
-- (0101) as the fast timeline. Attachment history is captured by auditing
-- erp_entity_attachments. Full tenant isolation via RLS; indexed for Customer
-- 360 / analytics / compliance.
-- ============================================================================

-- ── 1. Extend the audit store (additive) ────────────────────────────────────
alter table erp_audit_logs add column if not exists old_value jsonb;
alter table erp_audit_logs add column if not exists new_value jsonb;
alter table erp_audit_logs add column if not exists change_set text[];
alter table erp_audit_logs add column if not exists workflow_instance_id uuid
  references erp_workflow_instances(id) on delete set null;

create index if not exists idx_audit_entity      on erp_audit_logs(entity, entity_id, created_at desc);
create index if not exists idx_audit_company_ent  on erp_audit_logs(company_id, entity, created_at desc);
create index if not exists idx_audit_workflow     on erp_audit_logs(workflow_instance_id);
create index if not exists idx_audit_actor        on erp_audit_logs(actor_id);

-- ── 2. Generic capture: before/after diff for any audited table ─────────────
-- Records only CHANGED fields on update; the full row on insert/delete. Entity
-- = table name without the erp_ prefix. company_id read from the row when present.
-- SECURITY DEFINER → writes regardless of caller; reads stay RLS-gated.
create or replace function erp_audit_capture()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_old jsonb; v_new jsonb; v_company uuid; v_id text; v_action text;
  v_changed text[] := '{}'; v_oldc jsonb := '{}'::jsonb; v_newc jsonb := '{}'::jsonb; v_key text;
begin
  if tg_op = 'INSERT' then
    v_action := 'create'; v_new := to_jsonb(NEW);
  elsif tg_op = 'UPDATE' then
    v_action := 'update'; v_new := to_jsonb(NEW); v_old := to_jsonb(OLD);
  else
    v_action := 'delete'; v_old := to_jsonb(OLD);
  end if;

  v_id := coalesce(v_new->>'id', v_old->>'id');
  v_company := coalesce(nullif(v_new->>'company_id','')::uuid, nullif(v_old->>'company_id','')::uuid);

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if (v_new->v_key) is distinct from (v_old->v_key) and v_key <> 'updated_at' then
        v_changed := array_append(v_changed, v_key);
        v_oldc := v_oldc || jsonb_build_object(v_key, v_old->v_key);
        v_newc := v_newc || jsonb_build_object(v_key, v_new->v_key);
      end if;
    end loop;
    if array_length(v_changed, 1) is null then return NEW; end if;  -- nothing meaningful changed
  elsif tg_op = 'INSERT' then
    v_newc := v_new;
  else
    v_oldc := v_old;
  end if;

  insert into erp_audit_logs
    (actor_id, actor_email, company_id, action, entity, entity_id, old_value, new_value, change_set)
  values (
    auth.uid(),
    (select email from erp_profiles where id = auth.uid()),
    v_company, v_action, regexp_replace(tg_table_name, '^erp_', ''), v_id,
    case when v_action = 'create' then null else v_oldc end,
    case when v_action = 'delete' then null else v_newc end,
    case when v_action = 'update' then v_changed else null end
  );

  if tg_op = 'DELETE' then return OLD; else return NEW; end if;
end; $$;

-- ── 3. Attach capture to the initial audited set (master data + attachments +
--      request tables + the company/subscription cache). Reusable for more. ──
do $attach$
declare t text;
begin
  foreach t in array array[
    'erp_customers','erp_routes','erp_products_catalog','erp_suppliers',
    'erp_entity_attachments','erp_companies',
    'erp_subscription_change_requests','erp_onboarding_requests',
    'erp_module_requests','erp_credit_limit_requests'
  ] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
      execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function erp_audit_capture()', t);
    end if;
  end loop;
end $attach$;

-- ── 4. Workflow-linked audit: set workflow_instance_id on engine audit rows ──
-- Re-defines the 0101 triggers to write audit rows carrying the approval
-- reference (workflow instance), alongside the events timeline.
create or replace function erp_workflow_on_instance()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  if tg_op = 'INSERT' then
    insert into erp_workflow_events(company_id, instance_id, scope, event, step_no, actor_id, detail)
      values (NEW.company_id, NEW.id, NEW.scope, 'submitted', NEW.current_step, NEW.started_by,
              jsonb_build_object('entity', NEW.entity, 'record_id', NEW.record_id));
    insert into erp_audit_logs(actor_id, actor_email, company_id, action, entity, entity_id, details, workflow_instance_id)
      values (auth.uid(), (select email from erp_profiles where id = auth.uid()), NEW.company_id,
              'submit', 'workflow_instance', NEW.id::text,
              jsonb_build_object('entity', NEW.entity, 'scope', NEW.scope), NEW.id);
  elsif tg_op = 'UPDATE' and NEW.status is distinct from OLD.status then
    insert into erp_workflow_events(company_id, instance_id, scope, event, step_no, actor_id, detail)
      values (NEW.company_id, NEW.id, NEW.scope, 'status_changed', NEW.current_step, auth.uid(),
              jsonb_build_object('from', OLD.status, 'to', NEW.status));
    insert into erp_audit_logs(actor_id, actor_email, company_id, action, entity, entity_id, old_value, new_value, details, workflow_instance_id)
      values (auth.uid(), (select email from erp_profiles where id = auth.uid()), NEW.company_id,
              NEW.status, 'workflow_instance', NEW.id::text,
              jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status),
              jsonb_build_object('entity', NEW.entity), NEW.id);
  end if;
  return NEW;
end; $$;

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
              NEW.step_no, NEW.decided_by, jsonb_build_object('status', NEW.status, 'comment', NEW.comment));
    insert into erp_audit_logs(actor_id, actor_email, company_id, action, entity, entity_id, new_value, details, workflow_instance_id)
      values (auth.uid(), (select email from erp_profiles where id = auth.uid()), NEW.company_id,
              case when NEW.status='approved' then 'approve' when NEW.status='rejected' then 'reject' else NEW.status end,
              'workflow_task', NEW.id::text, jsonb_build_object('status', NEW.status),
              jsonb_build_object('step', NEW.step_no, 'comment', NEW.comment), NEW.instance_id);
  end if;
  return NEW;
end; $$;

-- ── 5. Tenant queryability: company admins read their own company's trail ────
-- (compliance / Customer 360). Owner + super-admin policy from 0024 remains.
drop policy if exists erp_audit_logs_company_read on erp_audit_logs;
create policy erp_audit_logs_company_read on erp_audit_logs for select
  using (
    company_id is not null
    and company_id = (select erp_user_company_id())
    and (select erp_is_company_admin(company_id))
  );

-- ============================================================================
-- ROLLBACK (manual): drop the trg_audit_* triggers and erp_audit_capture();
-- restore the 0101 bodies of erp_workflow_on_instance/on_task; drop the company
-- read policy. Added columns/indexes are additive and may remain.
-- ============================================================================
