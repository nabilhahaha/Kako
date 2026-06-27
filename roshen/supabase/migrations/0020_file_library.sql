-- =====================================================================
-- Roshen KSA — 0020 Team File Library (additive)
-- Private Storage bucket + file_asset metadata + file_share grants.
-- Visibility: private / selected_users / selected_role / selected_scope /
-- public_company. RLS enforces it; files in Storage, metadata in Postgres.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('file-library', 'file-library', false, 26214400)
on conflict (id) do nothing;

do $$ begin
  create type file_visibility as enum ('private','selected_users','selected_role','selected_scope','public_company');
exception when duplicate_object then null; end $$;

create table if not exists file_asset (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  owner_id      uuid not null references profile(id) on delete cascade,
  name          text not null,
  description   text,
  category      text,
  tags          text[],
  storage_path  text,
  filename      text,
  mime_type     text,
  size_bytes    bigint,
  visibility    file_visibility not null default 'private',
  visible_role  app_role,
  related_task_id   uuid references task(id) on delete set null,
  related_region_id uuid references region(id) on delete set null,
  related_city_id   uuid references city(id) on delete set null,
  related_agent_id  uuid references agent(id) on delete set null,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists file_asset_owner_idx on file_asset (owner_id);
create index if not exists file_asset_category_idx on file_asset (category);
alter table file_asset enable row level security;

create table if not exists file_share (
  id        uuid primary key default gen_random_uuid(),
  file_id   uuid not null references file_asset(id) on delete cascade,
  user_id   uuid references profile(id) on delete cascade,
  role      app_role,
  region_id uuid references region(id) on delete cascade,
  area_id   uuid references area(id) on delete cascade,
  city_id   uuid references city(id) on delete cascade,
  agent_id  uuid references agent(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists file_share_file_idx on file_share (file_id);
alter table file_share enable row level security;

-- Visibility helper (no auto-access for company managers to others' private files).
create or replace function can_see_file(
  p_id uuid, p_owner uuid, p_visibility file_visibility, p_visible_role app_role
) returns boolean language sql stable security definer set search_path = public as $$
  select
    is_admin()
    or p_owner = auth.uid()
    or p_visibility = 'public_company'
    or (p_visibility = 'selected_role' and p_visible_role = app_role())
    or (p_visibility in ('selected_users','selected_scope') and exists (
      select 1 from file_share g where g.file_id = p_id and (
        g.user_id = auth.uid()
        or g.role = app_role()
        or g.region_id in (select my_region_ids())
        or g.area_id in (select my_area_ids())
        or g.agent_id in (select my_agent_ids())
        or g.city_id in (select c.id from city c where c.region_id in (select my_region_ids()))
      )
    ));
$$;
revoke execute on function can_see_file(uuid,uuid,file_visibility,app_role) from anon, public;
grant execute on function can_see_file(uuid,uuid,file_visibility,app_role) to authenticated;

drop policy if exists file_asset_select on file_asset;
create policy file_asset_select on file_asset for select to authenticated
  using (can_see_file(id, owner_id, visibility, visible_role));
drop policy if exists file_asset_insert on file_asset;
create policy file_asset_insert on file_asset for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists file_asset_update on file_asset;
create policy file_asset_update on file_asset for update to authenticated
  using (owner_id = auth.uid() or is_admin()) with check (owner_id = auth.uid() or is_admin());
drop policy if exists file_asset_delete on file_asset;
create policy file_asset_delete on file_asset for delete to authenticated
  using (owner_id = auth.uid() or is_admin());

drop policy if exists file_share_select on file_share;
create policy file_share_select on file_share for select to authenticated
  using (file_id in (select id from file_asset));
drop policy if exists file_share_manage on file_share;
create policy file_share_manage on file_share for all to authenticated
  using (exists (select 1 from file_asset f where f.id = file_id and (f.owner_id = auth.uid() or is_admin())))
  with check (exists (select 1 from file_asset f where f.id = file_id and (f.owner_id = auth.uid() or is_admin())));

-- Storage RLS for file-library (path: <file_id>/<file>)
drop policy if exists file_lib_read on storage.objects;
create policy file_lib_read on storage.objects for select to authenticated
  using (bucket_id = 'file-library' and ((storage.foldername(name))[1])::uuid in (select id from file_asset));
drop policy if exists file_lib_insert on storage.objects;
create policy file_lib_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'file-library' and owner = auth.uid()
    and ((storage.foldername(name))[1])::uuid in (select id from file_asset where owner_id = auth.uid()));
drop policy if exists file_lib_delete on storage.objects;
create policy file_lib_delete on storage.objects for delete to authenticated
  using (bucket_id = 'file-library'
    and (owner = auth.uid() or ((storage.foldername(name))[1])::uuid in (select id from file_asset where owner_id = auth.uid() or is_admin())));
