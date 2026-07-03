# 08 — FMCG Intelligence Layer (CORE)

> **Implementation note (Phase 1):** these capabilities are implemented as a **configurable framework metamodel**, not hardcoded columns. DVAP, Customer Health, Visit Quality, Opportunity Scoring, and Customer Development Stages are all rows in `frameworks` (+ `framework_dimensions`, `framework_bands`, `framework_stages`, `framework_rules`) with **versioning, effective dates, company-specific overrides, and audit history** (migrations `0003`–`0004`). FMCG ships as the **default seeded configuration** (migration `0010`); other industries can add their own frameworks without code changes. The sections below describe that **FMCG default configuration** — the weights/bands/stages are seed data, and each assessment/score pins the exact framework version used so historical records never change. See `09-phase-1-deliverables.md` for the metamodel tables.

These six capabilities are **core architecture**, implemented in Phase 1 alongside the base schema — not future add-ons. They turn raw visit capture into FMCG-grade market intelligence. All are visit/customer-anchored and feed dashboards, health, and forecasting.

1. Customer Health Model
2. Customer Development Stages
3. Competitor Price Tracking
4. Opportunity Probability & Forecast Value
5. Visit Quality Score
6. DVAP Assessment Framework (Distribution · Visibility · Availability · Pricing · Promotion)

---

## 1. DVAP Assessment Framework (the backbone)

Every visit can carry a **DVAP assessment** — the FMCG execution scorecard. Five dimensions, each scored **0–100** (UI captures as 1–5 stars × 20, or %), with per-dimension notes and an auto-computed overall.

```sql
create table dvap_assessments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  customer_id uuid references customers(id),
  distribution_score numeric(5,2) check (distribution_score between 0 and 100),
  visibility_score   numeric(5,2) check (visibility_score   between 0 and 100),
  availability_score numeric(5,2) check (availability_score between 0 and 100),
  pricing_score      numeric(5,2) check (pricing_score      between 0 and 100),
  promotion_score    numeric(5,2) check (promotion_score    between 0 and 100),
  -- weighted overall (weights configurable; defaults below)
  overall_score numeric(5,2) generated always as (
    round(
      coalesce(distribution_score,0) * 0.25 +
      coalesce(visibility_score,0)   * 0.20 +
      coalesce(availability_score,0) * 0.25 +
      coalesce(pricing_score,0)      * 0.15 +
      coalesce(promotion_score,0)    * 0.15
    , 2)
  ) stored,
  distribution_notes text,
  visibility_notes text,
  availability_notes text,
  pricing_notes text,
  promotion_notes text,
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on dvap_assessments (customer_id, created_at);
```

**Spawn pattern:** a low dimension auto-suggests an execution entity — e.g. Availability < 60 → Issue (`out_of_stock`); Pricing gap → Issue (`pricing_issue`); Visibility low → Action; Distribution gap → Opportunity. This is how DVAP drives the Visit → Opportunity/Issue/Action/Follow-up graph.

## 2. Visit Quality Score

A 0–100 score measuring how complete/valuable a visit was — coaching tool for supervisors and a quality gate for data.

```sql
alter table visits
  add column quality_score numeric(5,2),
  add column quality_breakdown jsonb;
```

**Rubric (default weights, configurable):**
| Component | Points | Met when |
|---|---|---|
| Objective set | 10 | `objective` not null |
| Summary + outcome | 15 | both present |
| GPS in range | 15 | `gps_in_range = true` |
| Photos | 15 | ≥ 2 photos |
| DVAP completed | 20 | a `dvap_assessments` row exists |
| Competitor capture | 10 | ≥ 1 competitor observation/price point |
| Generated execution | 15 | ≥ 1 opportunity/issue/action/follow-up |

Computed by `fi_recompute_visit_quality(visit_id)` (called on visit close and on child insert) → writes `quality_score` + `quality_breakdown` JSON.

## 3. Customer Development Stages

A managed lifecycle per customer, with full history for trend/funnel analysis.

```sql
create type customer_dev_stage as enum (
  'prospect','onboarding','developing','established','strategic','at_risk','dormant'
);

alter table customers
  add column dev_stage customer_dev_stage not null default 'prospect',
  add column dev_stage_since timestamptz default now();

create table customer_dev_stage_history (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  from_stage customer_dev_stage,
  to_stage   customer_dev_stage not null,
  reason text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
```
A trigger logs every `dev_stage` change into the history table and stamps `dev_stage_since`.

## 4. Customer Health Model

A composite **health score (0–100)** + status band per customer, recomputed from live signals, with snapshots for trend lines.

```sql
create type customer_health_status as enum ('healthy','watch','at_risk','critical');

alter table customers
  add column health_score numeric(5,2),
  add column health_status customer_health_status,
  add column health_updated_at timestamptz;

create table customer_health_snapshots (
  id bigint generated always as identity primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  health_score numeric(5,2) not null,
  health_status customer_health_status not null,
  drivers jsonb,                 -- per-signal contributions for explainability
  captured_at timestamptz not null default now()
);
create index on customer_health_snapshots (customer_id, captured_at);
```

**Health formula (default; weights configurable, stored in `drivers` for transparency):**
| Signal | Weight | Direction |
|---|---|---|
| Latest DVAP overall | 30% | higher = healthier |
| Visit recency (vs cadence target) | 20% | recent = healthier |
| Open issues (severity-weighted) | 20% | fewer = healthier |
| Opportunity momentum (won/active value) | 15% | more = healthier |
| Pricing competitiveness (vs competitor price points) | 15% | in-line = healthier |

Bands: `>=80 healthy · 60–79 watch · 40–59 at_risk · <40 critical`. Computed by `fi_recompute_customer_health(customer_id)` (scheduled Edge Function nightly + on visit close), writing both the live columns and a snapshot.

## 5. Competitor Price Tracking

SKU-level competitor pricing over time — the basis for price trends and pricing-gap intelligence.

```sql
create table competitor_price_points (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  competitor_id uuid references competitors(id),
  competitor_name text,            -- fallback if not in catalog
  customer_id uuid references customers(id),
  product text not null,
  sku text,
  pack_size text,
  our_price   numeric(12,2),       -- our shelf price for comparison
  shelf_price numeric(12,2) not null,  -- competitor shelf price
  promo_price numeric(12,2),
  currency text default 'USD',
  on_promotion boolean default false,
  price_gap_pct numeric(6,2) generated always as (
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
```

## 6. Opportunity Probability & Forecast Value

Opportunities become a real **weighted pipeline**.

```sql
alter table opportunities
  add column probability int not null default 0 check (probability between 0 and 100),
  add column expected_close_date date,
  add column forecast_value numeric(14,2) generated always as (
    round(coalesce(estimated_value,0) * probability / 100.0, 2)
  ) stored;
```
Default probability can be derived from `status` (open 25 · in_progress 60 · closed_won 100 · closed_lost 0) but is editable. `forecast_value` powers the weighted pipeline KPI.

---

## Reporting views added by this layer

```sql
-- weighted, forecastable pipeline
create view v_pipeline_forecast as
  select area_id, status,
         count(*) n,
         coalesce(sum(estimated_value),0) gross_value,
         coalesce(sum(forecast_value),0)  weighted_value
  from opportunities where deleted_at is null
  group by area_id, status;

-- DVAP performance by area
create view v_dvap_by_area as
  select area_id,
         avg(distribution_score) dist, avg(visibility_score) vis,
         avg(availability_score) avail, avg(pricing_score) price,
         avg(promotion_score) promo,  avg(overall_score) overall
  from dvap_assessments group by area_id;

-- customer health distribution
create view v_customer_health_dist as
  select health_status, count(*) n
  from customers where deleted_at is null and health_status is not null
  group by health_status;

-- competitor price index (latest per product/competitor)
create view v_competitor_price_latest as
  select distinct on (product, competitor_id)
         product, competitor_id, shelf_price, promo_price, price_gap_pct, captured_at
  from competitor_price_points
  order by product, competitor_id, captured_at desc;
```

## Dashboard impact
These feed new executive tiles: **Customer Health heatmap**, **Development-stage funnel**, **DVAP scorecard by area**, **Weighted pipeline & forecast**, **Visit quality leaderboard**, and **Competitor price index / gap trends** — added to the dashboards in `03-screen-inventory.md` (K-group).
