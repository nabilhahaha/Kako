-- Field Insights — Phase 1: customers, locations, visits.
-- Customer Development Stage + Health reference configurable frameworks;
-- the chosen framework version is pinned for historical integrity.

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  name text not null,
  code text unique,
  channel text,
  segment text,
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  owner_id  uuid references profiles(id),
  -- Customer Development Stage (configurable stage_model framework)
  stage_framework_id uuid references frameworks(id),
  stage_id uuid references framework_stages(id),
  stage_since timestamptz default now(),
  -- Customer Health (configurable health framework)
  health_framework_id uuid references frameworks(id),
  health_score numeric(5,2),
  health_band_key text,
  health_updated_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on customers (area_id);
create index on customers (stage_id);
create trigger trg_customers_updated before update on customers
  for each row execute function fi_set_updated_at();

create table locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text,
  address text,
  city text,
  latitude  numeric(9,6),
  longitude numeric(9,6),
  geofence_radius_m integer default 150,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on locations (customer_id);
create trigger trg_locations_updated before update on locations
  for each row execute function fi_set_updated_at();

-- Development-stage change history
create table customer_dev_stage_history (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  framework_id uuid references frameworks(id),
  from_stage_id uuid references framework_stages(id),
  to_stage_id   uuid references framework_stages(id),
  reason text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
create index on customer_dev_stage_history (customer_id, changed_at);

create or replace function fi_log_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    new.stage_since := now();
    insert into customer_dev_stage_history(customer_id, framework_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, new.stage_framework_id, old.stage_id, new.stage_id, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_customer_stage_change before update on customers
  for each row execute function fi_log_stage_change();

-- Health snapshots for trend lines (pins framework version + drivers)
create table customer_health_snapshots (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  framework_id uuid references frameworks(id),
  health_score numeric(5,2) not null,
  health_band_key text,
  drivers jsonb,
  captured_at timestamptz not null default now()
);
create index on customer_health_snapshots (customer_id, captured_at);

-- Visits
create table visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  location_id uuid references locations(id),
  user_id     uuid not null references profiles(id),
  visit_type  visit_type not null,
  status      visit_status not null default 'draft',
  objective   text,
  summary     text,
  outcome     text,
  start_latitude  numeric(9,6),
  start_longitude numeric(9,6),
  gps_accuracy_m  numeric(6,1),
  gps_in_range    boolean,
  started_at  timestamptz,
  ended_at    timestamptz,
  -- Visit Quality Score (configurable visit_quality framework)
  quality_framework_id uuid references frameworks(id),
  quality_score numeric(5,2),
  quality_breakdown jsonb,
  sync_status sync_status not null default 'synced',
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on visits (user_id);
create index on visits (customer_id);
create index on visits (area_id);
create index on visits (started_at);
create trigger trg_visits_updated before update on visits
  for each row execute function fi_set_updated_at();

-- Geofence validation: compare start coords to the selected location.
create or replace function fi_visit_geofence()
returns trigger language plpgsql security definer set search_path = public as $$
declare loc record; dist numeric;
begin
  if new.location_id is null or new.start_latitude is null or new.start_longitude is null then
    new.gps_in_range := null;
    return new;
  end if;
  select latitude, longitude, coalesce(geofence_radius_m,150) as r into loc
  from locations where id = new.location_id;
  if loc.latitude is null then new.gps_in_range := null; return new; end if;
  -- haversine (metres)
  dist := 6371000 * 2 * asin(sqrt(
      power(sin(radians(new.start_latitude - loc.latitude)/2), 2) +
      cos(radians(loc.latitude)) * cos(radians(new.start_latitude)) *
      power(sin(radians(new.start_longitude - loc.longitude)/2), 2)
  ));
  new.gps_in_range := dist <= loc.r;
  return new;
end;
$$;
create trigger trg_visit_geofence before insert or update on visits
  for each row execute function fi_visit_geofence();
