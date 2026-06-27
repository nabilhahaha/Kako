-- =====================================================================
-- Roshen KSA — 0022 Channel main/sub + distributor coverage (additive)
-- Non-destructive. Adds parent/main grouping to channels and a coverage
-- matrix so one distributor can cover many regions/cities and sub-channels.
-- =====================================================================

-- Main/sub channels: a channel with parent_id = null is a MAIN channel
-- (e.g. TT, MT); sub-channels reference their main via parent_id.
alter table channel add column if not exists parent_id uuid references channel(id) on delete set null;
create index if not exists channel_parent_idx on channel (parent_id);

-- Coverage matrix: clean many-to-many between a master distributor and the
-- regions/cities/sub-channels it serves. region_id/city_id optional (a row may
-- scope a whole region, a single city, or the whole kingdom when both null).
create table if not exists distributor_coverage (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references company(id) on delete cascade,
  distributor_id  uuid not null references agent(id) on delete cascade,
  region_id       uuid references region(id) on delete cascade,
  city_id         uuid references city(id) on delete cascade,
  main_channel_id uuid references channel(id) on delete set null,
  sub_channel_id  uuid references channel(id) on delete set null,
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profile(id) on delete set null,
  updated_by      uuid references profile(id) on delete set null
);
create index if not exists distributor_coverage_dist_idx on distributor_coverage (distributor_id);
create index if not exists distributor_coverage_region_idx on distributor_coverage (region_id);
create index if not exists distributor_coverage_city_idx on distributor_coverage (city_id);
alter table distributor_coverage enable row level security;

-- Reference/config data: readable by any authenticated user (like channel/city),
-- writable by Admin only.
drop policy if exists distributor_coverage_read on distributor_coverage;
create policy distributor_coverage_read on distributor_coverage for select to authenticated using (true);
drop policy if exists distributor_coverage_write on distributor_coverage;
create policy distributor_coverage_write on distributor_coverage for all to authenticated
  using (is_admin()) with check (is_admin());
