-- Field Insights — Phase 1: configurable scoring/assessment metamodel.
-- Makes DVAP, Customer Health, Visit Quality, Opportunity Scoring, and
-- Customer Development Stages data-driven (templates, weights, bands, rules)
-- instead of hardcoded. FMCG ships as the default seeded configuration
-- (see 0009_seed); other industries can add their own frameworks later.

create type framework_kind as enum (
  'assessment',          -- e.g. DVAP scorecard
  'health',              -- customer health composite
  'visit_quality',       -- visit completeness/quality
  'opportunity_scoring', -- probability factors
  'stage_model'          -- customer development lifecycle
);

create type rule_comparator as enum ('lt','lte','gt','gte','eq','neq');
create type rule_action     as enum ('spawn_issue','spawn_opportunity','spawn_action','spawn_follow_up','flag','set_band');

-- A configurable framework. `industry` keeps FMCG primary while allowing others.
create table frameworks (
  id uuid primary key default gen_random_uuid(),
  key text not null,                 -- e.g. 'dvap','customer_health'
  name text not null,
  kind framework_kind not null,
  industry text not null default 'fmcg',
  description text,
  version int not null default 1,
  is_active boolean not null default true,
  is_default boolean not null default false,  -- default framework for its kind+industry
  config jsonb not null default '{}'::jsonb,  -- free-form extra settings
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, version)
);
create unique index frameworks_default_per_kind
  on frameworks (kind, industry) where is_default and is_active;
create trigger trg_frameworks_updated before update on frameworks
  for each row execute function fi_set_updated_at();

-- Weighted dimensions: DVAP dimensions, health signals, visit-quality
-- components, opportunity factors — all live here.
create table framework_dimensions (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references frameworks(id) on delete cascade,
  key text not null,
  label text not null,
  weight numeric(6,3) not null default 1,     -- relative weight
  scale_min numeric(6,2) not null default 0,
  scale_max numeric(6,2) not null default 100,
  sort int not null default 0,
  config jsonb not null default '{}'::jsonb,
  unique (framework_id, key)
);
create index on framework_dimensions (framework_id, sort);

-- Score bands (RAG / health status / quality tiers) per framework.
create table framework_bands (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references frameworks(id) on delete cascade,
  key text not null,                 -- e.g. 'healthy','watch','at_risk','critical'
  label text not null,
  min_score numeric(6,2) not null,
  max_score numeric(6,2) not null,
  color text,                        -- hex for UI
  sort int not null default 0,
  unique (framework_id, key)
);
create index on framework_bands (framework_id, min_score);

-- Configurable lifecycle stages for stage_model frameworks
-- (Customer Development Stages).
create table framework_stages (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references frameworks(id) on delete cascade,
  key text not null,
  label text not null,
  sort int not null default 0,
  is_entry boolean not null default false,
  is_terminal boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  unique (framework_id, key)
);
create index on framework_stages (framework_id, sort);

-- Automation/scoring rules: threshold -> action (spawn entity, set band...).
create table framework_rules (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references frameworks(id) on delete cascade,
  dimension_id uuid references framework_dimensions(id) on delete cascade,
  name text not null,
  comparator rule_comparator not null,
  threshold numeric(8,2) not null,
  action rule_action not null,
  action_params jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort int not null default 0
);
create index on framework_rules (framework_id, sort);

-- Resolve the active default framework for a kind (+industry).
create or replace function fi_default_framework(p_kind framework_kind, p_industry text default 'fmcg')
returns uuid language sql stable as $$
  select id from frameworks
  where kind = p_kind and industry = p_industry and is_active and is_default
  order by version desc limit 1
$$;
