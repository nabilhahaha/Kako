-- Field Insights — Phase 1: execution graph.
-- Every visit can generate Opportunity, Issue, Action, and Follow-up.

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete set null,
  customer_id uuid references customers(id),
  title text not null,
  description text,
  estimated_value numeric(14,2),
  currency text default 'USD',
  priority priority_level not null default 'medium',
  -- Opportunity scoring (configurable opportunity_scoring framework)
  scoring_framework_id uuid references frameworks(id),
  score numeric(6,2),
  score_breakdown jsonb,
  probability int not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  due_date date,
  forecast_value numeric(14,2) generated always as (
    round(coalesce(estimated_value,0) * probability / 100.0, 2)
  ) stored,
  status opportunity_status not null default 'open',
  owner_id uuid references profiles(id),
  created_by uuid references profiles(id),
  region_id uuid references regions(id),
  area_id   uuid references areas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on opportunities (area_id);
create index on opportunities (status);
create index on opportunities (customer_id);
create trigger trg_opportunities_updated before update on opportunities
  for each row execute function fi_set_updated_at();

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
create index on issues (area_id);
create index on issues (status);
create index on issues (issue_type);
create trigger trg_issues_updated before update on issues
  for each row execute function fi_set_updated_at();

create table action_plans (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  issue_id uuid references issues(id) on delete set null,
  description text not null,
  responsible_id uuid references profiles(id),
  target_date date,
  status action_status not null default 'not_started',
  completion_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on action_plans (responsible_id, status);
create index on action_plans (visit_id);
create trigger trg_action_plans_updated before update on action_plans
  for each row execute function fi_set_updated_at();

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits(id) on delete cascade,
  customer_id uuid references customers(id),
  opportunity_id uuid references opportunities(id) on delete set null,
  issue_id uuid references issues(id) on delete set null,
  next_visit_id uuid references visits(id) on delete set null,
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
create trigger trg_follow_ups_updated before update on follow_ups
  for each row execute function fi_set_updated_at();
