-- =====================================================================
-- Roshen KSA — 0015 Coverage & Capability setup tables
--
-- Expands SLA beyond sales target: Customer Coverage planning and Sales-Force /
-- Service Capability inputs, per Region / City / Distributor (+ channel for
-- coverage), per month. Additive only.
--
-- RLS: read = global or in assigned scope; write = Admin (is_admin()).
-- Company Manager reviews (read); Area Manager read-only in MVP.
-- =====================================================================

create table if not exists coverage_target (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  period_month  date not null,
  level         org_level not null,                       -- 'region' | 'city' | 'agent'
  region_id     uuid references region(id) on delete cascade,
  city_id       uuid references city(id)   on delete cascade,
  agent_id      uuid references agent(id)  on delete cascade,
  channel_id    uuid references channel(id),              -- NULL = all channels
  required_customer_universe int,
  required_active_customers  int,
  required_coverage_pct      numeric(5,2),
  required_productive_pct    numeric(5,2),
  required_visits            int,                         -- future/optional
  created_by    uuid references profile(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists coverage_target_company_month_idx on coverage_target (company_id, period_month);
create index if not exists coverage_target_region_idx on coverage_target (region_id);
create index if not exists coverage_target_agent_idx  on coverage_target (agent_id);

create table if not exists capability_setup (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  period_month  date not null,
  level         org_level not null,                       -- 'region' | 'city' | 'agent'
  region_id     uuid references region(id) on delete cascade,
  city_id       uuid references city(id)   on delete cascade,
  agent_id      uuid references agent(id)  on delete cascade,
  required_salesmen     int,
  actual_salesmen       int,
  warehouse_required    boolean not null default false,
  warehouse_available   boolean not null default false,
  cashvan_required      boolean not null default false,
  cashvan_available     boolean not null default false,
  supervisor_required   boolean not null default false,
  supervisor_available  boolean not null default false,
  notes         text,
  created_by    uuid references profile(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists capability_setup_company_month_idx on capability_setup (company_id, period_month);
create index if not exists capability_setup_region_idx on capability_setup (region_id);
create index if not exists capability_setup_agent_idx  on capability_setup (agent_id);

alter table coverage_target enable row level security;
alter table capability_setup enable row level security;

-- read = global or in assigned scope (region / city's region / agent)
create policy coverage_target_read on coverage_target for select to authenticated
  using (
    is_global()
    or (level = 'region' and region_id in (select my_region_ids()))
    or (level = 'agent'  and agent_id  in (select my_agent_ids()))
    or (level = 'city'   and (select c.region_id from city c where c.id = city_id) in (select my_region_ids()))
  );
create policy coverage_target_write on coverage_target for all to authenticated
  using (is_admin()) with check (is_admin());

create policy capability_setup_read on capability_setup for select to authenticated
  using (
    is_global()
    or (level = 'region' and region_id in (select my_region_ids()))
    or (level = 'agent'  and agent_id  in (select my_agent_ids()))
    or (level = 'city'   and (select c.region_id from city c where c.id = city_id) in (select my_region_ids()))
  );
create policy capability_setup_write on capability_setup for all to authenticated
  using (is_admin()) with check (is_admin());
