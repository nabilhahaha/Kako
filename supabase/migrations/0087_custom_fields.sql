-- ============================================================================
-- 0087: Custom Fields Engine — Phase A (Core Platform capability).
-- ----------------------------------------------------------------------------
-- Any entity can have per-company custom fields. Definitions live in
-- erp_custom_fields (company + entity scoped); VALUES live in a `custom jsonb`
-- column ON the entity row (Option A) — best fit for Import/Export round-trip,
-- forms binding, and read performance. Entity-based, not industry-specific.
-- Additive + idempotent.
-- ============================================================================

-- Field definitions (the per-company, per-entity config).
create table if not exists erp_custom_fields (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  entity        text not null,                          -- registry entity key
  key           text not null,                          -- slug = jsonb key in `custom`
  label_ar      text not null,
  label_en      text,
  type          text not null check (type in ('text','number','date','boolean','select','multiselect','file')),
  required      boolean not null default false,
  options       jsonb not null default '[]'::jsonb,     -- [{value,label_en,label_ar}] for select/multiselect
  default_value jsonb,
  validation    jsonb not null default '{}'::jsonb,     -- {min,max,minLen,maxLen,regex}
  visibility    jsonb,                                  -- {when,op,value} conditional rule (Dynamic Forms)
  help_ar       text,
  help_en       text,
  sort          integer not null default 0,
  is_active     boolean not null default true,
  created_by    uuid references erp_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_by    uuid references erp_profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (company_id, entity, key)
);
create index if not exists idx_custom_fields_company_entity on erp_custom_fields(company_id, entity);

-- Value storage: a jsonb bag on each entity row. Added to the Phase-A entities
-- (customer/supplier/product/branch — the import/export V1 set). Adding it to a
-- new entity later is a one-line additive column.
alter table erp_customers        add column if not exists custom jsonb not null default '{}'::jsonb;
alter table erp_suppliers        add column if not exists custom jsonb not null default '{}'::jsonb;
alter table erp_products_catalog add column if not exists custom jsonb not null default '{}'::jsonb;
alter table erp_branches         add column if not exists custom jsonb not null default '{}'::jsonb;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table erp_custom_fields enable row level security;

-- Read: any company member (so forms/import/export can resolve the schema) or
-- platform owner. Write: company admin or owner (the app additionally gates the
-- UI/actions on the settings.custom_fields permission). Values are governed by
-- each host entity's existing RLS — they live on the row.
drop policy if exists erp_custom_fields_read on erp_custom_fields;
create policy erp_custom_fields_read on erp_custom_fields for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id())
);
drop policy if exists erp_custom_fields_write on erp_custom_fields;
create policy erp_custom_fields_write on erp_custom_fields for all using (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
) with check (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
);

-- Auto-stamp company_id on insert (mirrors other tenant tables).
drop trigger if exists erp_custom_fields_set_company on erp_custom_fields;
create trigger erp_custom_fields_set_company before insert on erp_custom_fields
  for each row execute function erp_org_set_company();

-- Audit every definition change (add/edit/disable) — sensitive config.
create or replace function erp_custom_fields_audit()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp' as $$
begin
  perform erp_log_audit(lower(tg_op) || '_custom_field', 'custom_field',
    coalesce(new.id, old.id)::text,
    jsonb_build_object('entity', coalesce(new.entity, old.entity),
                       'key', coalesce(new.key, old.key),
                       'type', coalesce(new.type, old.type)),
    coalesce(new.company_id, old.company_id));
  return coalesce(new, old);
end; $$;
revoke all on function erp_custom_fields_audit() from public, anon, authenticated;

drop trigger if exists erp_custom_fields_audit_t on erp_custom_fields;
create trigger erp_custom_fields_audit_t
  after insert or update or delete on erp_custom_fields
  for each row execute function erp_custom_fields_audit();
