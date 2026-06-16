-- Field Insights — Phase 1: capture tables + generic configurable assessments.

create table competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table visit_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  storage_path text not null,
  category photo_category not null default 'other',
  description text,
  latitude  numeric(9,6),
  longitude numeric(9,6),
  taken_at  timestamptz not null default now(),
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now()
);
create index on visit_photos (visit_id);

create table competitor_observations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  competitor_id uuid references competitors(id),
  competitor_name text,
  product text,
  price numeric(12,2),
  currency text default 'USD',
  promotion text,
  display_quality display_quality,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on competitor_observations (visit_id);
create trigger trg_competitor_obs_updated before update on competitor_observations
  for each row execute function fi_set_updated_at();

alter table visit_photos
  add column competitor_observation_id uuid references competitor_observations(id) on delete set null;

-- Competitor Price Tracking (SKU-level, time series)
create table competitor_price_points (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  competitor_id uuid references competitors(id),
  competitor_name text,
  customer_id uuid references customers(id),
  product text not null,
  sku text,
  pack_size text,
  our_price   numeric(12,2),
  shelf_price numeric(12,2) not null,
  promo_price numeric(12,2),
  currency text default 'USD',
  on_promotion boolean default false,
  price_gap_pct numeric(8,2) generated always as (
    case when our_price is not null and our_price <> 0
      then round((shelf_price - our_price) / our_price * 100, 2)
      else null end
  ) stored,
  photo_id uuid references visit_photos(id) on delete set null,
  captured_at timestamptz not null default now(),
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  sync_status sync_status not null default 'synced'
);
create index on competitor_price_points (product, captured_at);
create index on competitor_price_points (competitor_id, captured_at);

create table voice_notes (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  storage_path text not null,
  duration_seconds integer,
  transcript text,
  transcription_status text default 'pending',
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now()
);
create index on voice_notes (visit_id);

-- ---- Generic configurable assessments (DVAP = one configured framework) --
-- The framework VERSION is pinned so historical scoring never changes when
-- the framework evolves. Per-dimension scores live in assessment_scores.
create table assessments (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references frameworks(id),  -- pinned version
  visit_id uuid references visits(id) on delete cascade,
  customer_id uuid references customers(id),
  overall_score numeric(6,2),
  band_key text,
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on assessments (framework_id);
create index on assessments (visit_id);
create index on assessments (customer_id, created_at);
create trigger trg_assessments_updated before update on assessments
  for each row execute function fi_set_updated_at();

create table assessment_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  dimension_id uuid references framework_dimensions(id),
  dimension_key text not null,        -- denormalized for historical integrity
  score numeric(6,2),
  notes text,
  unique (assessment_id, dimension_key)
);
create index on assessment_scores (assessment_id);
