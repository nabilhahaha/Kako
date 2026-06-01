-- ============================================================================
-- 0114: Dynamic Form & Workflow Builder — B1 (data model, RLS, audit, versioning)
-- ----------------------------------------------------------------------------
-- Foundation tables for no-code request types: form definitions (+ versioning),
-- typed fields with rules, and submissions. Bound to the Workflow & Approval
-- Engine (workflow_key) and the foundations (audit-captured; analytics/effects
-- come in later increments). Global templates (company_id NULL) + per-company
-- forms. Additive + idempotent; multi-tenant via RLS.
-- ============================================================================

-- ── Form definitions (versioned) ────────────────────────────────────────────
create table if not exists erp_form_definitions (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references erp_companies(id) on delete cascade,   -- NULL = global template
  key           text not null,
  name_ar       text, name_en text,
  module        text,
  target_entity text,                                                  -- what the form is about (e.g. customer)
  workflow_key  text,                                                  -- bound workflow definition key
  effect        jsonb not null default '{"type":"record_only"}'::jsonb,
  status        text not null default 'draft' check (status in ('draft','active','archived')),
  version       integer not null default 1,
  is_latest     boolean not null default true,
  created_by    uuid references erp_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique nulls not distinct (company_id, key, version)
);
create index if not exists idx_form_defs_lookup on erp_form_definitions(company_id, key, is_latest);

-- ── Form fields ─────────────────────────────────────────────────────────────
create table if not exists erp_form_fields (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references erp_form_definitions(id) on delete cascade,
  key           text not null,
  label_ar      text, label_en text,
  type          text not null check (type in
                  ('text','number','date','dropdown','multiselect','attachment','image','gps','signature','section')),
  section       text,
  sort_order    integer not null default 0,
  required      boolean not null default false,
  options       jsonb,        -- choices for dropdown/multiselect
  validation    jsonb,        -- min/max/length/regex/range
  visibility    jsonb,        -- conditional show/hide (same condition language as the workflow engine)
  default_value text,
  created_at    timestamptz not null default now(),
  unique (form_id, key)
);
create index if not exists idx_form_fields_form on erp_form_fields(form_id, sort_order);

-- ── Form submissions ────────────────────────────────────────────────────────
create table if not exists erp_form_submissions (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references erp_companies(id) on delete cascade,
  form_id              uuid not null references erp_form_definitions(id) on delete restrict,
  record_id            text,
  submitter            uuid references erp_profiles(id) on delete set null,
  values               jsonb not null default '{}'::jsonb,
  status               text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  workflow_instance_id uuid references erp_workflow_instances(id) on delete set null,
  created_at           timestamptz not null default now()
);
create index if not exists idx_form_subs_company on erp_form_submissions(company_id, created_at desc);
create index if not exists idx_form_subs_form on erp_form_submissions(form_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table erp_form_definitions enable row level security;
alter table erp_form_fields      enable row level security;
alter table erp_form_submissions enable row level security;

-- Definitions: read globals + own company; write = company admin (own) / owner (global).
drop policy if exists erp_form_defs_read on erp_form_definitions;
create policy erp_form_defs_read on erp_form_definitions for select using (
  (select erp_is_platform_owner()) or company_id is null or company_id = (select erp_user_company_id())
);
drop policy if exists erp_form_defs_write on erp_form_definitions;
create policy erp_form_defs_write on erp_form_definitions for all using (
  (select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id)))
) with check (
  (select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id)))
);

-- Fields: governed by their parent form.
drop policy if exists erp_form_fields_read on erp_form_fields;
create policy erp_form_fields_read on erp_form_fields for select using (
  exists (select 1 from erp_form_definitions d where d.id = form_id
           and ((select erp_is_platform_owner()) or d.company_id is null or d.company_id = (select erp_user_company_id())))
);
drop policy if exists erp_form_fields_write on erp_form_fields;
create policy erp_form_fields_write on erp_form_fields for all using (
  exists (select 1 from erp_form_definitions d where d.id = form_id
           and ((select erp_is_platform_owner()) or (d.company_id is not null and (select erp_is_company_admin(d.company_id)))))
) with check (
  exists (select 1 from erp_form_definitions d where d.id = form_id
           and ((select erp_is_platform_owner()) or (d.company_id is not null and (select erp_is_company_admin(d.company_id)))))
);

-- Submissions: company-scoped; members insert/read their company's; updates by
-- company members (approval stamps) or owner. (Refined with effect handlers later.)
drop policy if exists erp_form_subs_read on erp_form_submissions;
create policy erp_form_subs_read on erp_form_submissions for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);
drop policy if exists erp_form_subs_insert on erp_form_submissions;
create policy erp_form_subs_insert on erp_form_submissions for insert with check (
  company_id = (select erp_user_company_id())
);
drop policy if exists erp_form_subs_update on erp_form_submissions;
create policy erp_form_subs_update on erp_form_submissions for update using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
) with check (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);

-- ── Versioning helper: clone a definition (+ its fields) as the next version ─
create or replace function erp_form_new_version(p_form uuid)
returns uuid language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare d erp_form_definitions; v_new uuid;
begin
  select * into d from erp_form_definitions where id = p_form;
  if d.id is null then raise exception 'form not found'; end if;
  if not ((select erp_is_platform_owner()) or (d.company_id is not null and (select erp_is_company_admin(d.company_id)))) then
    raise exception 'forbidden';
  end if;
  update erp_form_definitions set is_latest = false where company_id is not distinct from d.company_id and key = d.key;
  insert into erp_form_definitions(company_id, key, name_ar, name_en, module, target_entity, workflow_key, effect, status, version, is_latest, created_by)
  values (d.company_id, d.key, d.name_ar, d.name_en, d.module, d.target_entity, d.workflow_key, d.effect, 'draft', d.version + 1, true, auth.uid())
  returning id into v_new;
  insert into erp_form_fields(form_id, key, label_ar, label_en, type, section, sort_order, required, options, validation, visibility, default_value)
  select v_new, key, label_ar, label_en, type, section, sort_order, required, options, validation, visibility, default_value
    from erp_form_fields where form_id = p_form;
  return v_new;
end; $$;
revoke all on function erp_form_new_version(uuid) from public, anon;
grant execute on function erp_form_new_version(uuid) to authenticated;

-- ── Audit integration: capture changes to all three tables (Foundation #1) ──
do $attach$
declare t text;
begin
  foreach t in array array['erp_form_definitions','erp_form_fields','erp_form_submissions'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists trg_audit_%1$s on %1$s', t);
      execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s for each row execute function erp_audit_capture()', t);
    end if;
  end loop;
end $attach$;

-- ============================================================================
-- ROLLBACK (manual): drop erp_form_new_version, the trg_audit_* triggers, and
-- erp_form_submissions / erp_form_fields / erp_form_definitions.
-- ============================================================================
