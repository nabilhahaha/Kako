-- Import Engine: saved mapping templates (Save / Clone / Share / Default).
-- Company-scoped, RLS. Generic by target_entity so it serves every registered
-- entity. A template stores a column→field mapping a user reuses across imports.
-- See docs/INTEGRATION.md §3.
create table if not exists erp_import_mappings (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  target_entity text not null,
  name          text not null,
  mapping       jsonb not null default '{}'::jsonb,
  is_shared     boolean not null default false,  -- visible to the whole company
  is_default    boolean not null default false,  -- auto-applied for this entity
  created_by    uuid references erp_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_import_mappings_company
  on erp_import_mappings(company_id, target_entity);
-- At most one default per (company, entity).
create unique index if not exists uq_import_mappings_default
  on erp_import_mappings(company_id, target_entity) where is_default;

alter table erp_import_mappings enable row level security;

-- Read: platform owner, or a company member who can see it — their own
-- templates plus any shared by colleagues.
drop policy if exists erp_import_mappings_read on erp_import_mappings;
create policy erp_import_mappings_read on erp_import_mappings
  for select using (
    (select erp_is_platform_owner())
    or (company_id = (select erp_user_company_id())
        and (is_shared or created_by = auth.uid()))
  );

-- Insert: into own company, stamped as the creator.
drop policy if exists erp_import_mappings_insert on erp_import_mappings;
create policy erp_import_mappings_insert on erp_import_mappings
  for insert with check (
    company_id = (select erp_user_company_id()) and created_by = auth.uid()
  );

-- Update / delete: the creator, or a company admin.
drop policy if exists erp_import_mappings_update on erp_import_mappings;
create policy erp_import_mappings_update on erp_import_mappings
  for update using (
    (select erp_is_platform_owner())
    or created_by = auth.uid()
    or (select erp_is_company_admin(company_id))
  );
drop policy if exists erp_import_mappings_delete on erp_import_mappings;
create policy erp_import_mappings_delete on erp_import_mappings
  for delete using (
    (select erp_is_platform_owner())
    or created_by = auth.uid()
    or (select erp_is_company_admin(company_id))
  );

drop trigger if exists erp_import_mappings_set_company on erp_import_mappings;
create trigger erp_import_mappings_set_company before insert on erp_import_mappings
  for each row execute function erp_org_set_company();

-- Setting a default must clear the previous default for the same (company,
-- entity) — which may belong to another user — so do it in one SECURITY DEFINER
-- step scoped to the caller's own company. Pass p_id = null to just clear.
create or replace function erp_set_default_mapping(p_id uuid)
returns void language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare
  v_company uuid := erp_user_company_id();
  v_entity  text;
begin
  if v_company is null then
    raise exception 'no company context';
  end if;
  if p_id is not null then
    select target_entity into v_entity from erp_import_mappings
      where id = p_id and company_id = v_company;
    if v_entity is null then
      raise exception 'mapping not found in your company';
    end if;
    update erp_import_mappings
      set is_default = false, updated_at = now()
      where company_id = v_company and target_entity = v_entity and is_default;
    update erp_import_mappings
      set is_default = true, is_shared = true, updated_at = now()
      where id = p_id;
  end if;
end; $$;

-- Supabase default-privileges auto-grant EXECUTE to anon on new public
-- functions, so revoke anon explicitly (mirrors the project's hardened baseline)
-- and grant only signed-in users.
revoke all on function erp_set_default_mapping(uuid) from public, anon;
grant execute on function erp_set_default_mapping(uuid) to authenticated;
