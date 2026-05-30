-- Entity Framework: shared, polymorphic capability tables keyed by
-- (entity, record_id) so ONE row type serves every entity (current + future).
-- Company-scoped, RLS enforced. Additive & safe — touches no existing module.
-- See docs/ENTITY-FRAMEWORK.md.

create table if not exists erp_entity_notes (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  entity      text not null,
  record_id   text not null,
  body        text not null,
  created_by  uuid references erp_profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_entity_notes_lookup on erp_entity_notes(company_id, entity, record_id);

create table if not exists erp_entity_attachments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  entity      text not null,
  record_id   text not null,
  file_name   text not null,
  file_path   text not null,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid references erp_profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_entity_attachments_lookup on erp_entity_attachments(company_id, entity, record_id);

alter table erp_entity_notes       enable row level security;
alter table erp_entity_attachments enable row level security;

drop policy if exists erp_entity_notes_read on erp_entity_notes;
create policy erp_entity_notes_read on erp_entity_notes
  for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_entity_notes_write on erp_entity_notes;
create policy erp_entity_notes_write on erp_entity_notes
  for all using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()))
  with check ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

drop policy if exists erp_entity_attachments_read on erp_entity_attachments;
create policy erp_entity_attachments_read on erp_entity_attachments
  for select using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_entity_attachments_write on erp_entity_attachments;
create policy erp_entity_attachments_write on erp_entity_attachments
  for all using ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()))
  with check ((select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

drop trigger if exists erp_entity_notes_set_company on erp_entity_notes;
create trigger erp_entity_notes_set_company before insert on erp_entity_notes
  for each row execute function erp_org_set_company();
drop trigger if exists erp_entity_attachments_set_company on erp_entity_attachments;
create trigger erp_entity_attachments_set_company before insert on erp_entity_attachments
  for each row execute function erp_org_set_company();
