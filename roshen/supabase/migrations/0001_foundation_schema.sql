-- =====================================================================
-- Roshen KSA Branch Management Platform
-- 0001 — Foundational schema (PROPOSAL, not yet applied to any project)
--
-- Covers: organizational hierarchy, users & scope, the flexible
-- column-mapping engine (versioned), value mapping, raw-data import
-- pipeline with validation issues, normalized sales facts, and SLA targets.
-- RLS lives in 0002; reporting views live in 0003.
--
-- Conventions (approved):
--   * Multi-company safe: company_id on every tenant table.
--   * Currency defaults to 'SAR'.
--   * Channels are configurable per company (not hardcoded).
--   * Reporting tables carry a reporting period (period_month = first of month).
--   * Per-agent flexible column + value mapping; mappings are versioned and
--     editable without destroying old imports.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
create type org_level      as enum ('company','country','region','area','branch','agent');
create type app_role       as enum (
  'company_manager','area_manager','branch_manager',
  'sales_supervisor','salesman','finance','admin'
);
create type agent_type     as enum ('agent','distributor');
-- Import lifecycle: pending → mapped → previewed → validated → imported;
-- plus superseded / cancelled / failed.
create type import_status   as enum (
  'pending','mapped','previewed','validated','imported',
  'superseded','cancelled','failed'
);
create type mapping_status  as enum ('draft','active','archived');
create type value_dimension as enum ('channel','city','return_reason','salesman','customer','item');
create type issue_severity  as enum ('error','warning','info');
create type txn_type        as enum ('sale','return','credit_note');
create type invoice_status  as enum ('posted','cancelled','draft');

-- Per-mapping-version sales calculation policy (avoids a hardcoded universal
-- net-sales rule; each agent's file semantics differ).
create type sales_value_basis as enum (
  'gross_before_discount','net_after_discount',
  'excluding_vat_before_discount','excluding_vat_after_discount'
);
create type vat_handling      as enum ('value_excludes_vat','value_includes_vat');
create type discount_handling as enum (
  'discount_already_deducted','subtract_cash_discount','ignore_discount_for_sla'
);
create type returns_handling  as enum (
  'returns_already_deducted','subtract_returns_value','store_returns_only'
);
create type sla_actual_basis  as enum (
  'sales_value_excluding_vat','net_sales_excluding_vat',
  'gross_sales_excluding_vat','custom_formula_later'
);

-- ---------------------------------------------------------------------
-- Organizational hierarchy (company_id denormalized on every level)
-- ---------------------------------------------------------------------
create table company (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table country (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  name        text not null,
  iso_code    text,
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
  region_id   uuid references region(id) on delete set null,
  name        text not null,
  unique (company_id, name)
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

create table channel (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  name        text not null,
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
  code        text not null,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, code)
);
create index on agent (branch_id);
create index on agent (company_id);

-- Optional product master (master SKU = roshen_item_code) and customer master.
create table product (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  roshen_item_code text not null,
  item_name     text,
  brand         text,
  item_category text,
  product_family text,
  barcode       text,
  uom           text,
  carton_to_piece_factor numeric(18,4),
  created_at    timestamptz not null default now(),
  unique (company_id, roshen_item_code)
);

create table customer (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  customer_code text not null,
  customer_name text,
  city_id       uuid references city(id),
  channel_id    uuid references channel(id),
  created_at    timestamptz not null default now(),
  unique (company_id, customer_code)
);

-- ---------------------------------------------------------------------
-- Users & access scope
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
  level       org_level not null,
  region_id   uuid references region(id) on delete cascade,
  area_id     uuid references area(id)  on delete cascade,
  branch_id   uuid references branch(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index on user_scope (user_id);
create index on user_scope (area_id);

-- ---------------------------------------------------------------------
-- Column-mapping engine (flexible, per-agent, VERSIONED)
--   profile  = the agent's logical mapping (one default per agent)
--   version  = immutable snapshot of field mapping + headers; bumped on edit
--   value_mapping = source-value → canonical-value rules (channel/city/...)
-- Editing a mapping creates a NEW version; existing import_batch rows keep
-- the mapping_version_id they were imported with, so old imports are intact.
-- ---------------------------------------------------------------------
create table column_mapping_profile (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  agent_id      uuid not null references agent(id) on delete cascade,
  name          text not null default 'Default mapping',
  is_default    boolean not null default true,
  current_version_id uuid,          -- FK added after version table (circular)
  status        mapping_status not null default 'active',
  created_by    uuid references profile(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index one_default_mapping_per_agent
  on column_mapping_profile (agent_id) where is_default;

create table column_mapping_version (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references company(id) on delete cascade,
  profile_id     uuid not null references column_mapping_profile(id) on delete cascade,
  agent_id       uuid not null references agent(id) on delete cascade,
  version_number int  not null,
  source_headers jsonb not null,    -- ["Cust Name","Inv No",...] as seen in the file
  field_mapping  jsonb not null,    -- { canonical_field: { source, format? } }
  value_mapping  jsonb,             -- optional snapshot of applied value rules
  -- Sales calculation policy (configurable per agent/version; MVP defaults
  -- yield SLA = sales_value_excl_vat − returns_value − cash_discount).
  sales_value_basis sales_value_basis not null default 'excluding_vat_before_discount',
  vat_handling      vat_handling      not null default 'value_excludes_vat',
  vat_rate          numeric(6,4)      not null default 0.15,  -- used when value_includes_vat
  discount_handling discount_handling not null default 'subtract_cash_discount',
  returns_handling  returns_handling  not null default 'subtract_returns_value',
  sla_actual_basis  sla_actual_basis  not null default 'net_sales_excluding_vat',
  notes          text,
  status         mapping_status not null default 'active',
  created_by     uuid references profile(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (profile_id, version_number)
);
create index on column_mapping_version (agent_id);

alter table column_mapping_profile
  add constraint fk_profile_current_version
  foreign key (current_version_id)
  references column_mapping_version(id) on delete set null;

-- Value mapping: normalize differing source values to one canonical value.
-- agent_id NULL = company-wide fallback rule.
create table value_mapping (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  agent_id      uuid references agent(id) on delete cascade,
  dimension     value_dimension not null,
  source_value  text not null,            -- "TT", "Traditional", "GT", "جدة" ...
  canonical_text text,                     -- normalized label (return_reason/salesman/customer)
  channel_id    uuid references channel(id),
  city_id       uuid references city(id),
  is_active     boolean not null default true,
  created_by    uuid references profile(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- One rule per (company, agent-or-global, dimension, source value)
create unique index value_mapping_unique on value_mapping (
  company_id,
  coalesce(agent_id, '00000000-0000-0000-0000-000000000000'),
  dimension,
  lower(source_value)
);
create index on value_mapping (company_id, dimension);

-- ---------------------------------------------------------------------
-- Raw-data import pipeline
-- ---------------------------------------------------------------------
create table import_batch (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references company(id) on delete cascade,
  agent_id           uuid not null references agent(id) on delete restrict,
  period_month       date not null,
  uploaded_by        uuid references profile(id),
  source_filename    text,
  storage_path       text,
  file_checksum      text,
  file_size_bytes    bigint,
  status             import_status not null default 'pending',
  mapping_version_id uuid references column_mapping_version(id),
  detected_date_format text,
  -- Snapshot of the effective mapping actually applied (audit/reproducibility)
  resolved_field_mapping jsonb,
  resolved_value_mapping jsonb,
  calculation_policy     jsonb,   -- snapshot of the sales calc policy used

  row_count          int not null default 0,
  error_count        int not null default 0,
  warning_count      int not null default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  imported_at        timestamptz
);
create index on import_batch (agent_id, period_month);
create index on import_batch (company_id, period_month);

-- One active (imported) batch per agent per month; re-uploads supersede.
create unique index one_active_batch_per_agent_month
  on import_batch (agent_id, period_month)
  where status = 'imported';

create table raw_import_row (
  id                    bigint generated always as identity primary key,
  batch_id              uuid not null references import_batch(id) on delete cascade,
  row_number            int not null,
  raw                   jsonb not null,   -- ORIGINAL uploaded row, preserved verbatim
  -- Date-normalization annotations (raw stays untouched above)
  raw_invoice_date      text,
  normalized_invoice_date date,
  date_parse_confidence numeric(5,2),     -- 0..100
  date_parse_error      text,
  is_valid              boolean not null default true,
  excluded              boolean not null default false
);
create index on raw_import_row (batch_id);

-- Validation issues surfaced in the preview/review step.
create table import_issue (
  id          bigint generated always as identity primary key,
  batch_id    uuid not null references import_batch(id) on delete cascade,
  row_number  int,                        -- NULL = batch-level issue
  severity    issue_severity not null,
  code        text not null,              -- MISSING_REQUIRED, DATE_UNPARSEABLE, UNKNOWN_CHANNEL, UNKNOWN_CITY, DUP_INVOICE, ...
  field       text,
  message     text not null,
  raw_value   text,
  created_at  timestamptz not null default now()
);
create index on import_issue (batch_id, severity);

-- ---------------------------------------------------------------------
-- Normalized sales facts (rich line model)
--   gross_sales_ex_vat / net_sales_ex_vat / sla_actual_value are computed at
--   import per the mapping version's calculation policy (no generated column).
-- ---------------------------------------------------------------------
create table sales_fact (
  id            bigint generated always as identity primary key,
  company_id    uuid not null references company(id) on delete cascade,
  batch_id      uuid not null references import_batch(id) on delete cascade,
  -- denormalized hierarchy
  agent_id      uuid not null references agent(id),
  branch_id     uuid not null references branch(id),
  area_id       uuid not null references area(id),
  region_id     uuid not null references region(id),
  country_id    uuid not null references country(id),
  channel_id    uuid references channel(id),
  -- identity / customer / item
  invoice_number    text,
  customer_code     text,
  customer_name     text,
  item_code         text,
  item_name         text,
  roshen_item_code  text,                  -- master SKU when present
  barcode           text,
  item_category     text,
  brand             text,
  product_family    text,
  uom               text,
  carton_to_piece_factor numeric(18,4),
  -- dates
  invoice_date      date not null,         -- normalized YYYY-MM-DD
  period_month      date not null,         -- from invoice_date / reporting_month
  -- classification
  txn_type          txn_type,
  invoice_status    invoice_status,
  credit_note_number text,
  salesman_name     text,
  route_number      text,
  return_reason     text,
  -- money (SAR) — ORIGINAL values as supplied (post value-mapping, pre-policy)
  source_sales_value   numeric(18,2),       -- the headline sales value as supplied
  sales_value_excl_vat numeric(18,2),       -- ex-VAT value if the file provides it
  gross_value          numeric(18,2),       -- gross before discount (reported)
  net_value_reported   numeric(18,2),       -- net after discount as in file (reconcile)
  vat_amount           numeric(18,2),
  returns_value        numeric(18,2) not null default 0,
  cash_discount        numeric(18,2) not null default 0,
  -- CALCULATED at import per the mapping version's calculation policy
  gross_sales_ex_vat   numeric(18,2),       -- standardized gross ex-VAT, pre discount/returns
  net_sales_ex_vat     numeric(18,2),       -- standardized net ex-VAT (after policy deductions)
  sla_actual_value     numeric(18,2),       -- the value counted toward SLA (per sla_actual_basis)
  calculation_policy_used jsonb,            -- policy snapshot applied to this row
  -- quantities
  sales_qty_cartons numeric(18,3) not null default 0,
  sales_qty_pieces  numeric(18,3) not null default 0,
  return_qty_cartons numeric(18,3),
  return_qty_pieces  numeric(18,3),
  currency          text not null default 'SAR',
  -- reserved: switch to Saudi selling-day calendar without schema change
  is_selling_day    boolean
);
create index on sales_fact (period_month, area_id);
create index on sales_fact (period_month, region_id);
create index on sales_fact (period_month, agent_id, channel_id);
create index on sales_fact (company_id, period_month);
create index on sales_fact (batch_id);
create index on sales_fact (roshen_item_code);
create index on sales_fact (invoice_number);

-- ---------------------------------------------------------------------
-- SLA targets (primary grain: agent x channel x month; roll-up to company)
-- ---------------------------------------------------------------------
create table sla_target (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  period_month  date not null,
  level         org_level not null,
  country_id    uuid references country(id),
  region_id     uuid references region(id),
  area_id       uuid references area(id),
  branch_id     uuid references branch(id),
  agent_id      uuid references agent(id),
  channel_id    uuid references channel(id),   -- NULL = all channels
  target_amount numeric(18,2) not null default 0,
  target_qty    numeric(18,3),
  working_days  int,
  currency      text not null default 'SAR',
  created_by    uuid references profile(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
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
