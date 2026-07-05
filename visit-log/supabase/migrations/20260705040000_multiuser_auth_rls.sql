-- Multi-user authentication, roles, ownership and data isolation.
-- Adds a profiles/role model, an is_admin() helper, ownership columns and
-- customer visibility, and replaces the single-owner RLS policies with
-- per-user isolation + full admin access. Master (global) customers are shared;
-- private customers are visible only to their owner and the administrator.

-- ---------------------------------------------------------------- roles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'salesperson' check (role in ('salesperson', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin check runs as definer so policies can call it without recursing on
-- profiles' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-provision a profile for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.visit_log_set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_self_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------- ownership + visibility
alter table public.customers
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column if not exists owner_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  add column if not exists visibility text not null default 'private' check (visibility in ('global', 'private'));

alter table public.visits
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

alter table public.visit_photos
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill existing rows so ownership columns are complete, then lock them down.
update public.customers set created_by = coalesce(created_by, user_id), owner_user_id = coalesce(owner_user_id, user_id);
update public.visits set created_by = coalesce(created_by, user_id);
update public.visit_photos set created_by = coalesce(created_by, user_id);
-- All pre-existing customers become the shared master list.
update public.customers set visibility = 'global';

alter table public.customers alter column owner_user_id set not null;
alter table public.customers alter column created_by set not null;

create trigger visit_photos_set_updated_at
  before update on public.visit_photos
  for each row execute function public.visit_log_set_updated_at();

create index if not exists customers_owner_idx on public.customers (owner_user_id);
create index if not exists customers_visibility_idx on public.customers (visibility);
create index if not exists visits_user_idx on public.visits (user_id);

-- --------------------------------------------------------------- RLS: customers
drop policy if exists "customers_owner_all" on public.customers;

create policy "customers_select" on public.customers
  for select to authenticated
  using (visibility = 'global' or owner_user_id = auth.uid() or public.is_admin());

create policy "customers_insert" on public.customers
  for insert to authenticated
  with check (public.is_admin() or (owner_user_id = auth.uid() and user_id = auth.uid()));

create policy "customers_update" on public.customers
  for update to authenticated
  using (public.is_admin() or owner_user_id = auth.uid())
  with check (public.is_admin() or owner_user_id = auth.uid());

create policy "customers_delete" on public.customers
  for delete to authenticated
  using (public.is_admin() or owner_user_id = auth.uid());

-- ----------------------------------------------------------------- RLS: visits
drop policy if exists "visits_owner_all" on public.visits;

create policy "visits_select" on public.visits
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "visits_insert" on public.visits
  for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());

create policy "visits_update" on public.visits
  for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

create policy "visits_delete" on public.visits
  for delete to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- ----------------------------------------------------------- RLS: visit_photos
drop policy if exists "visit_photos_owner_all" on public.visit_photos;

create policy "visit_photos_select" on public.visit_photos
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "visit_photos_insert" on public.visit_photos
  for insert to authenticated
  with check (public.is_admin() or user_id = auth.uid());

create policy "visit_photos_update" on public.visit_photos
  for update to authenticated
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

create policy "visit_photos_delete" on public.visit_photos
  for delete to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- --------------------------------------------------------------- RLS: storage
-- Administrators can read/manage every object in the private bucket; owners keep
-- access to their own <user_id>/... folder via the existing policies.
create policy "visit_images_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'visit-images' and public.is_admin())
  with check (bucket_id = 'visit-images' and public.is_admin());
