-- Field Insights — Phase 1: geography, profiles, RBAC helpers
-- The FMCG dev-stage / health-status enums are replaced by the configurable
-- framework metamodel (see 0003); drop them before they are referenced.
drop type if exists customer_dev_stage;
drop type if exists customer_health_status;

create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id) on delete cascade,
  name text not null,
  city text,
  created_at timestamptz not null default now()
);
create index on areas (region_id);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  role user_role not null default 'field_user',
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  manager_id uuid references profiles(id),
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on profiles (area_id);
create index on profiles (role);
create trigger trg_profiles_updated before update on profiles
  for each row execute function fi_set_updated_at();

-- Auto-create a profile when a new auth user signs up.
create or replace function fi_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.email,''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function fi_handle_new_user();

-- ---- RBAC helpers ------------------------------------------------------
create or replace function fi_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function fi_my_area()
returns uuid language sql stable security definer set search_path = public as $$
  select area_id from profiles where id = auth.uid()
$$;

create or replace function fi_my_region()
returns uuid language sql stable security definer set search_path = public as $$
  select region_id from profiles where id = auth.uid()
$$;

create or replace function fi_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(fi_role() in ('platform_admin','business_manager'), false)
$$;

create or replace function fi_can_access_area(target_area uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r user_role;
begin
  r := fi_role();
  if r is null then return false; end if;
  if r in ('platform_admin','business_manager') then return true; end if;
  if r = 'regional_manager' then
    return exists (select 1 from areas a where a.id = target_area and a.region_id = fi_my_region());
  end if;
  -- area_manager / supervisor / field_user / viewer: own area
  return target_area is not distinct from fi_my_area();
end;
$$;
