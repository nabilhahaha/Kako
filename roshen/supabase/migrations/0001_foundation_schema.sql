-- =====================================================================
-- Roshen KSA Branch Management Platform
-- 0001 — Foundational schema (PROPOSAL, not yet applied to any project)
--
-- Covers: organizational hierarchy, users & scope assignment,
-- raw-data import pipeline, normalized sales facts, and SLA targets.
-- RLS lives in 0002; reporting views live in 0003.
--
-- Conventions (approved):
--   * Multi-company safe: company_id on every tenant table.
--   * Currency defaults to 'SAR'.
--   * Channels are configurable per company (not hardcoded).
--   * Reporting tables carry a reporting period (period_month = first of month).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type org_level     as enum ('company','country','region','area','branch','agent');
create type app_role      as enum (
  'company_manager','area_manager','branch_manager',
  'sales_supervisor','salesman','finance','admin'
);
create type agent_type    as enum ('agent','distributor');
create type import_status as enum (
  'pending','mapped','validated','imported','superseded','failed'
);

-- ---------------------------------------------------------------------
-- Organizational hierarchy
--   company > country > region > area > branch (city) > agent/distributor
--   Every level carries company_id (denormalized) for multi-company
--   isolation and fast tenant filtering.
-- ---------------------------------------------------------------------
create table company (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table country (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  name        text not null,            -- 'Saudi Arabia'
  iso_code    text,                     -- 'SA'
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create table region (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  country_id  uuid not null references country(id) on delete cascade,
  name        text not null,
  code        text,
  created_at  timestamptz not null default now(),
  unique (country_id, name)
);

create table city (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  region_id   uuid not null references region(id) on delete cascade,
  name        text not null,
  unique (region_id, name)
);

create table area (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  region_id   uuid not null references region(id) on delete cascade,
  name        text not null,
  code        text,
  created_at  timestamptz not null default now(),
  unique (region_id, name)
);

create table branch (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  area_id     uuid not null references area(id) on delete cascade,
  city_id     uuid references city(id),
  name        text not null,
  code        text,
  created_at  timestamptz not null default now(),
  unique (area_id, name)
);

-- Channels are configurable per company (not hardcoded).
create table channel (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  name        text not null,            -- e.g. Modern Trade / Traditional Trade / HoReCa / Wholesale
  code        text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create table agent (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  branch_id   uuid not null references branch(id) on delete restrict,
  channel_id  uuid references channel(id),
  type        agent_type not null default 'distributor',
  code        text not null,            -- distributor code as it appears in raw files
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, code)             -- code unique within a company
);
create index on agent (branch_id);
create index on agent (company_id);

-- ---------------------------------------------------------------------
-- Users & access scope
--   profile mirrors auth.users; user_scope grants area managers (and
--   future scoped roles) visibility to specific parts of the hierarchy.
--   company_manager / admin are global (within their company).
-- ---------------------------------------------------------------------
create table profile (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references company(id) on delete set null,
  full_name   text,
  email       text,
  role        app_role not null default 'area_manager',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table user_scope (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  user_id     uuid not null references profile(id) on delete cascade,
  level       org_level not null,       -- typically 'area'
  region_id   uuid references region(id) on delete cascade,
  area_id     uuid references area(id)  on delete cascade,
  branch_id   uuid references branch(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index on user_scope (user_id);
create index on user_scope (area_id);

-- ---------------------------------------------------------------------
-- Raw-data import pipeline
--   import_batch  = one uploaded file for one agent + month
--   raw_import_row = original untouched rows (audit / re-processing)
-- ---------------------------------------------------------------------
create table import_batch (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references company(id) on delete cascade,
  agent_id       uuid not null references agent(id) on delete restrict,
  period_month   date not null,         -- reporting period: first day of month
  uploaded_by    uuid references profile(id),
  source_filename text,
  storage_path   text,                  -- Supabase Storage object key
  status         import_status not null default 'pending',
  column_mapping jsonb,                 -- { canonical_field: source_header }
  row_count      int not null default 0,
  error_count    int not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  imported_at    timestamptz
);
create index on import_batch (agent_id, period_month);
create index on import_batch (company_id, period_month);

-- Exactly one *active* (imported) batch per agent per month; re-uploads
-- must mark the previous batch 'superseded' first. Prevents duplicate
-- active imports for the same agent + month.
create unique index one_active_batch_per_agent_month
  on import_batch (agent_id, period_month)
  where status = 'imported';

create table raw_import_row (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references import_batch(id) on delete cascade,
  row_number  int not null,
  raw         jsonb not null,           -- the original uploaded row, preserved verbatim
  error       text
);
create index on raw_import_row (batch_id);

-- ---------------------------------------------------------------------
-- Normalized sales facts
--   Hierarchy keys are denormalized at import time for fast scoped
--   queries and simple RLS. Only rows whose batch is 'imported' count.
-- ---------------------------------------------------------------------
create table sales_fact (
  id           bigint generated always as identity primary key,
  company_id   uuid not null references company(id) on delete cascade,
  batch_id     uuid not null references import_batch(id) on delete cascade,
  agent_id     uuid not null references agent(id),
  branch_id    uuid not null references branch(id),
  area_id      uuid not null references area(id),
  region_id    uuid not null references region(id),
  country_id   uuid not null references country(id),
  channel_id   uuid references channel(id),
  txn_date     date not null,
  period_month date not null,           -- reporting period (normalized month)
  sku          text,
  product_name text,
  quantity     numeric(18,3) not null default 0,
  gross_amount numeric(18,2) not null default 0,
  net_amount   numeric(18,2) not null default 0,
  currency     text not null default 'SAR',
  -- Reserved for switching from calendar to Saudi selling-day calendar later.
  is_selling_day boolean
);
create index on sales_fact (period_month, area_id);
create index on sales_fact (period_month, region_id);
create index on sales_fact (period_month, agent_id, channel_id);
create index on sales_fact (company_id, period_month);
create index on sales_fact (batch_id);

-- ---------------------------------------------------------------------
-- SLA targets
--   MVP primary grain: agent x channel x month (level='agent').
--   Direct area/region/branch/company targets remain supported for
--   future flexibility. channel_id NULL = all channels.
-- ---------------------------------------------------------------------
create table sla_target (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  period_month  date not null,          -- reporting period: first of month
  level         org_level not null,     -- agent (MVP) | branch | area | region | country
  country_id    uuid references country(id),
  region_id     uuid references region(id),
  area_id       uuid references area(id),
  branch_id     uuid references branch(id),
  agent_id      uuid references agent(id),
  channel_id    uuid references channel(id),   -- NULL = all channels
  target_amount numeric(18,2) not null default 0,
  target_qty    numeric(18,3),
  working_days  int,                    -- planned selling days, for run-rate
  currency      text not null default 'SAR',
  created_by    uuid references profile(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Uniqueness across nullable dimensions (sentinel UUID for NULLs).
create unique index sla_target_unique on sla_target (
  period_month, level,
  coalesce(country_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(region_id,  '00000000-0000-0000-0000-000000000000'),
  coalesce(area_id,    '00000000-0000-0000-0000-000000000000'),
  coalesce(branch_id,  '00000000-0000-0000-0000-000000000000'),
  coalesce(agent_id,   '00000000-0000-0000-0000-000000000000'),
  coalesce(channel_id, '00000000-0000-0000-0000-000000000000')
);
create index on sla_target (period_month, area_id);
create index on sla_target (period_month, region_id);
create index on sla_target (company_id, period_month);
