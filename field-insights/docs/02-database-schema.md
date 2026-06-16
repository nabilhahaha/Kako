# 02 — Database Schema

Target: a **new, dedicated Supabase (Postgres) project**. No table, enum, function, or policy below exists in or references the VANTORA database.

## 1. Entity Relationship Overview

The model is **relationship-centric, not a set of standalone forms**. The **Visit is the hub**: every visit can generate the four execution entities — **Opportunity, Issue, Action, Follow-up** — and those entities also link to each other (an Action can belong to an Opportunity or an Issue; a Follow-up can schedule the next visit and close the loop back to a Visit). This is what turns visit logging into a market-execution system.

```
                         ┌──────────────┐
        customers ──< locations          │
            │                            │
            └──────< VISITS >────────────┘   (the hub)
                       │ │ │ │ │ │ │
   visit_photos  <─────┘ │ │ │ │ │ └─────> voice_notes
   competitor_obs <──────┘ │ │ │ └────────> action_plans ─┐
   opportunities <─────────┘ │ └──────────> issues ───────┤
   follow_ups   <────────────┘                            │
        ▲   ▲                                              │
        │   └──── action_plans.opportunity_id ────────────┘
        └──────── follow_ups.{opportunity_id,issue_id,next_visit_id}

profiles ──< visits (user_id, owner, responsible, manager_id)
regions ──< areas ──< (customers, profiles, visits)     audit_logs (all)
```

Legend: `A ──< B` = one A has many B. Cross-links (Action↔Opportunity/Issue, Follow-up↔Opportunity/Issue/Visit) are nullable FKs so any entity can stand alone *or* be woven into the graph.

**Execution priority (drives UI order & defaults):** Visit → Opportunity → Issue → Action → Follow-up.

## 2. Enums

```sql
create type user_role as enum (
  'platform_admin','business_manager','regional_manager',
  'area_manager','supervisor','field_user','viewer'
);

create type visit_type as enum (
  'follow_up','new_customer','competitor_check','market_survey',
  'merchandising_audit','complaint_investigation','trade_marketing_visit','distributor_visit'
);

create type visit_status as enum ('draft','in_progress','completed','cancelled');

create type photo_category as enum (
  'store_front','shelf','display','promotion',
  'competitor_activity','price_tag','product_availability','other'
);

create type opportunity_status as enum ('open','in_progress','closed_won','closed_lost');
create type priority_level    as enum ('low','medium','high','critical');

create type issue_type as enum (
  'out_of_stock','pricing_issue','distribution_issue',
  'visibility_issue','customer_complaint','competitor_threat'
);
create type severity_level as enum ('low','medium','high','critical');
create type issue_status   as enum ('open','in_progress','resolved','closed');

create type action_status   as enum ('not_started','in_progress','completed','cancelled');
create type display_quality as enum ('poor','fair','good','excellent');
create type sync_status     as enum ('pending','synced','failed');
```

## 3. Tables (DDL)

> Conventions: `id uuid primary key default gen_random_uuid()` (client may supply UUID for offline), `created_at/updated_at timestamptz default now()`, soft-delete via `deleted_at`. `updated_at` maintained by trigger; used for last-write-wins.

### Geography & People

```sql
create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id),
  name text not null,
  city text,
  created_at timestamptz not null default now()
);

-- mirrors auth.users; one row per user
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role user_role not null default 'field_user',
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  manager_id uuid references profiles(id),    -- reporting line
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Customers & Locations

```sql
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,                 -- external/customer code
  channel text,                     -- e.g. retail, wholesale, distributor
  segment text,
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  owner_id  uuid references profiles(id),   -- account owner
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text,                        -- "Main store", "Branch 2"
  address text,
  city text,
  latitude  numeric(9,6),
  longitude numeric(9,6),
  geofence_radius_m integer default 150,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Visits (module 1 + 8 GPS)

```sql
create table visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  location_id uuid references locations(id),
  user_id     uuid not null references profiles(id),   -- who performed it
  visit_type  visit_type not null,
  status      visit_status not null default 'draft',
  objective   text,
  summary     text,
  outcome     text,
  -- GPS validation (module 8)
  start_latitude  numeric(9,6),
  start_longitude numeric(9,6),
  gps_accuracy_m  numeric(6,1),
  gps_in_range    boolean,            -- computed vs location geofence
  started_at  timestamptz,
  ended_at    timestamptz,
  -- offline sync
  sync_status sync_status not null default 'synced',
  region_id uuid references regions(id),   -- denormalized for RLS/reporting
  area_id   uuid references areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on visits (user_id);
create index on visits (customer_id);
create index on visits (area_id);
create index on visits (started_at);
```

### Photo Intelligence (module 2)

```sql
create table visit_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  storage_path text not null,         -- bucket: visit-photos
  category photo_category not null default 'other',
  description text,
  latitude  numeric(9,6),
  longitude numeric(9,6),
  taken_at  timestamptz not null default now(),
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now()
);
create index on visit_photos (visit_id);
```

### Competitor Tracking (module 3)

```sql
create table competitors (              -- reusable catalog
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table competitor_observations (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  competitor_id uuid references competitors(id),
  competitor_name text,               -- free text fallback if not in catalog
  product text,
  price numeric(12,2),
  currency text default 'USD',
  promotion text,
  display_quality display_quality,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- competitor photos reuse visit_photos with category='competitor_activity',
-- optionally linked via this id:
alter table visit_photos add column competitor_observation_id uuid
  references competitor_observations(id) on delete set null;
```

### Opportunity Management (module 4)

```sql
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete set null,
  customer_id uuid references customers(id),
  title text not null,
  description text,
  estimated_value numeric(14,2),
  currency text default 'USD',
  priority priority_level not null default 'medium',
  due_date date,
  status opportunity_status not null default 'open',
  owner_id uuid references profiles(id),
  created_by uuid references profiles(id),
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

### Issue Tracking (module 5)

```sql
create table issues (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete set null,
  customer_id uuid references customers(id),
  issue_type issue_type not null,
  title text,
  description text,
  severity severity_level not null default 'medium',
  status   issue_status not null default 'open',
  owner_id uuid references profiles(id),
  due_date date,
  resolution_notes text,
  resolved_at timestamptz,
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

### Action Plans (module 6)

```sql
create table action_plans (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  -- cross-links: an action can advance an opportunity or resolve an issue
  opportunity_id uuid references opportunities(id) on delete set null,
  issue_id uuid references issues(id) on delete set null,
  description text not null,                 -- "Action"
  responsible_id uuid references profiles(id),
  target_date date,
  status action_status not null default 'not_started',
  completion_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### Follow-ups (the 5th execution entity)

A **follow-up** is the explicit "next touch" that keeps execution moving: a scheduled callback or, most often, a **follow-up visit**. It can stand alone or close the loop on an opportunity/issue, and can seed the next visit.

```sql
create type follow_up_type   as enum ('callback','next_visit','task','escalation');
create type follow_up_status as enum ('scheduled','in_progress','done','cancelled');

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,   -- originating visit
  customer_id uuid references customers(id),
  -- cross-links into the execution graph (all optional)
  opportunity_id uuid references opportunities(id) on delete set null,
  issue_id uuid references issues(id) on delete set null,
  next_visit_id uuid references visits(id) on delete set null, -- the visit it spawned
  type follow_up_type not null default 'next_visit',
  title text not null,
  notes text,
  assigned_to uuid references profiles(id),
  due_date date,
  status follow_up_status not null default 'scheduled',
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on follow_ups (assigned_to, status);
create index on follow_ups (due_date);
```

### Voice Notes (module 7)

```sql
create table voice_notes (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  storage_path text not null,          -- bucket: voice-notes
  duration_seconds integer,
  transcript text,
  transcription_status text default 'pending', -- pending|done|failed
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now()
);
```

### Audit

```sql
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id),
  entity_type text not null,           -- 'visit','opportunity',...
  entity_id uuid,
  action text not null,                -- 'insert','update','delete'
  diff jsonb,
  created_at timestamptz not null default now()
);
```

## 4. Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `visit-photos` | Visit & competitor photos | Private; signed URLs; policy ties object path `visit/{visit_id}/...` to visit visibility |
| `voice-notes` | Audio recordings | Private; same pattern |

## 5. RBAC — Role / Permission Matrix

Scope abbreviations: **All** = whole org · **Region** = own region · **Area** = own area · **Own** = records they created/own · **—** = none.

| Capability | Platform Admin | Business Mgr | Regional Mgr | Area Mgr | Supervisor | Field User | Viewer |
|---|---|---|---|---|---|---|---|
| Manage users/roles | All | — | — | — | — | — | — |
| Manage customers/locations | All | All | Region | Area | Area | — | — |
| Create/edit own visits | All | All | Region | Area | Area | **Own** | — |
| View visits | All | All | Region | Area | Area (team) | Own | Read (scope) |
| Photos / competitors / voice | All | All | Region | Area | Area | Own | Read |
| Opportunities | All | All | Region | Area | Area | Own | Read |
| Issues | All | All | Region | Area | Area | Own (+assigned) | Read |
| Action plans (assign) | All | All | Region | Area | Area | Own (+assigned) | Read |
| Dashboards | All | All | Region | Area | Area | Own | Scope read |
| Reports (generate/export) | All | All | Region | Area | Area | Own | Export read |
| Platform settings | All | — | — | — | — | — | — |

**Geographic scope** is derived from `profiles.region_id` / `profiles.area_id`; managers see everything at/below their level via the `manager_id` chain or region/area match.

## 6. Row Level Security (representative policies)

RLS is **enabled on every table**. A helper function centralizes the scope check.

```sql
-- current user's role
create or replace function fi_role() returns user_role language sql stable as $$
  select role from profiles where id = auth.uid()
$$;

-- can the current user access a given area?
create or replace function fi_can_access_area(target_area uuid)
returns boolean language sql stable as $$
  select case
    when fi_role() in ('platform_admin','business_manager') then true
    when fi_role() = 'regional_manager' then exists (
      select 1 from areas a join profiles p on p.region_id = a.region_id
      where a.id = target_area and p.id = auth.uid())
    when fi_role() in ('area_manager','supervisor','field_user','viewer') then
      target_area = (select area_id from profiles where id = auth.uid())
    else false end
$$;

alter table visits enable row level security;

create policy visits_select on visits for select using (
  fi_role() in ('platform_admin','business_manager')
  or fi_can_access_area(area_id)
  or user_id = auth.uid()
);

create policy visits_insert on visits for insert with check (
  user_id = auth.uid() and fi_role() <> 'viewer'
);

create policy visits_update on visits for update using (
  user_id = auth.uid()
  or fi_role() in ('platform_admin','business_manager','regional_manager','area_manager','supervisor')
);
```

Child tables (`visit_photos`, `competitor_observations`, `action_plans`, `voice_notes`) inherit visibility through their parent `visit_id` via an `exists (select 1 from visits v where v.id = visit_id and <visits_select predicate>)` policy. `opportunities` / `issues` use the same area-scope pattern on their own `area_id`.

## 7. Reporting Views (feed dashboards)

```sql
create view v_visits_by_city as
  select coalesce(l.city, a.city) as city, count(*) as visits
  from visits vi
  left join locations l on l.id = vi.location_id
  left join areas a on a.id = vi.area_id
  where vi.deleted_at is null group by 1;

create view v_opportunity_pipeline as
  select status, priority, count(*) n, coalesce(sum(estimated_value),0) value
  from opportunities where deleted_at is null group by 1,2;

create view v_issues_by_category as
  select issue_type, status, count(*) n
  from issues where deleted_at is null group by 1,2;

create view v_actions_due as
  select * from action_plans
  where status <> 'completed' and target_date <= current_date + 7;
```

## 8. Triggers

- `set_updated_at` BEFORE UPDATE on all mutable tables.
- `tg_audit` AFTER INSERT/UPDATE/DELETE on `visits`, `opportunities`, `issues` → writes `audit_logs`.
- `tg_visit_geofence` BEFORE INSERT/UPDATE on `visits` → sets `gps_in_range` by comparing start coords to the location geofence.

## 9. Future-Module Extension Design

The schema is built so the next wave of modules attaches to the **Visit hub** without reshaping existing tables. Each future module is a new child of `visits` (and/or `customers`) plus, where useful, links into the Opportunity/Issue/Action/Follow-up graph.

| Future module | Primary new table(s) | Hooks into existing model |
|---|---|---|
| **Competitor Intelligence** | `competitor_observations` (already defined) + `competitor_price_points` | Child of `visits`; feeds competitor dashboard; can spawn Opportunity/Issue |
| **Price Monitoring** | `price_checks` (sku, our_price, shelf_price, competitor_price, captured_at, photo) | Child of `visits`; deviation can auto-spawn an Issue (`pricing_issue`) |
| **Merchandising Audits** | `audits` + `audit_template_items` + `audit_responses` | `audits.visit_id`; failed items spawn Actions/Issues |
| **Trade Marketing Audits** | reuse `audits` with `audit_type='trade_marketing'` (template-driven) | Same engine as merchandising; different template |
| **Route Planning** | `routes` + `route_stops` (planned customer + day + sequence) | `route_stops.customer_id`; a completed stop creates a `visit`; Follow-ups can auto-insert stops |
| **Customer Development Tracking** | `customer_dev_stages` + `customer_dev_events` | Child of `customers`; Opportunities roll up into development stage progression |

**Design rules that make this cheap later:**
1. **Visit-anchored:** every capture table carries `visit_id` (+ denormalized `region_id`/`area_id` for RLS & reporting).
2. **Template engine reuse:** merchandising and trade-marketing audits share one `audits` engine keyed by `audit_type` + template — no new subsystem per audit kind.
3. **Spawn pattern:** any module can create Opportunity/Issue/Action/Follow-up via the same cross-link FKs, so "every visit generates the four entities" holds for future modules too.
4. **Additive migrations only:** new modules ship as new tables + policies; no destructive changes to Phase-1 tables.

## 10. FMCG Intelligence Layer (core)

Six FMCG capabilities are part of the **core** schema (shipped in Phase 1, not future add-ons): Customer Health Model, Customer Development Stages, Competitor Price Tracking, Opportunity Probability & Forecast Value, Visit Quality Score, and the DVAP Assessment Framework (Distribution · Visibility · Availability · Pricing · Promotion). Full DDL, scoring formulas, and reporting views are specified in [`08-fmcg-intelligence-layer.md`](08-fmcg-intelligence-layer.md). These add columns to `customers`, `visits`, and `opportunities`, and add the tables `dvap_assessments`, `customer_health_snapshots`, `customer_dev_stage_history`, and `competitor_price_points`.
