-- Field Insights — Phase 1: framework governance.
-- Every configurable framework supports: versioning, effective dates,
-- company-specific overrides, and audit history. Historical records stay
-- intact because each assessment/score pins the exact framework VERSION used.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Temporal + tenancy + lineage on frameworks.
alter table frameworks
  add column company_id uuid references companies(id) on delete cascade,  -- null = global template
  add column effective_from date not null default current_date,
  add column effective_to date,
  add column supersedes_id uuid references frameworks(id);

-- Rework uniqueness: a version is unique per (key, company); company NULL
-- treated as the global namespace.
alter table frameworks drop constraint if exists frameworks_key_version_key;
create unique index frameworks_key_company_version
  on frameworks (key, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), version);

-- One active default per (kind, industry, company).
drop index if exists frameworks_default_per_kind;
create unique index frameworks_default_per_kind
  on frameworks (kind, industry, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default and is_active;

-- Resolve the framework to use for a kind: prefer company override, then
-- global; must be active and effective on the given date; newest version wins.
create or replace function fi_resolve_framework(
  p_kind framework_kind,
  p_industry text default 'fmcg',
  p_company uuid default null,
  p_at date default current_date
) returns uuid language sql stable as $$
  select id from frameworks
  where kind = p_kind and industry = p_industry and is_active
    and effective_from <= p_at
    and (effective_to is null or effective_to >= p_at)
    and (company_id is null or company_id = p_company)
  order by (company_id is not null) desc, is_default desc, version desc
  limit 1
$$;

-- ---- Audit history for all framework configuration tables --------------
create table framework_audit_log (
  id bigint generated always as identity primary key,
  framework_id uuid,
  entity_table text not null,
  entity_id uuid,
  action text not null,           -- insert | update | delete
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on framework_audit_log (framework_id, created_at);

create or replace function fi_audit_framework_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare nj jsonb; oj jsonb; fid uuid; eid uuid;
begin
  if tg_op <> 'INSERT' then oj := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then nj := to_jsonb(new); end if;
  fid := coalesce((coalesce(nj, oj)->>'framework_id')::uuid, (coalesce(nj, oj)->>'id')::uuid);
  eid := (coalesce(nj, oj)->>'id')::uuid;
  insert into framework_audit_log(framework_id, entity_table, entity_id, action, actor_id, old_data, new_data)
  values (fid, tg_table_name, eid, lower(tg_op), auth.uid(), oj, nj);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger trg_audit_frameworks after insert or update or delete on frameworks
  for each row execute function fi_audit_framework_change();
create trigger trg_audit_framework_dimensions after insert or update or delete on framework_dimensions
  for each row execute function fi_audit_framework_change();
create trigger trg_audit_framework_bands after insert or update or delete on framework_bands
  for each row execute function fi_audit_framework_change();
create trigger trg_audit_framework_stages after insert or update or delete on framework_stages
  for each row execute function fi_audit_framework_change();
create trigger trg_audit_framework_rules after insert or update or delete on framework_rules
  for each row execute function fi_audit_framework_change();
