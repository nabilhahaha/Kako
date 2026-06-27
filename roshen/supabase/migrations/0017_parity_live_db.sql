-- =====================================================================
-- Roshen KSA — 0017 Parity migration (repo ⇄ live DB alignment)
--
-- WHY THIS FILE EXISTS
--   Migrations 0006–0016 were applied to the remote Roshen project
--   (ref: wrkugzssuoxneftzappa) during earlier sessions but their SQL was
--   never committed to this repository, and the remote migration history
--   did not retain the original statements, so they cannot be reconstructed
--   verbatim. This migration re-declares the *current live objects* that the
--   Roshen app depends on, so a fresh checkout matches what is deployed.
--
-- SAFETY
--   * Idempotent: create table/column/index IF NOT EXISTS, create or replace
--     view/function, drop-then-create policies. Safe to run repeatedly.
--   * Non-destructive: no DROP TABLE/COLUMN, no DELETE/TRUNCATE, no data reset.
--   * On the live DB every guarded statement is a no-op (objects already
--     exist); the file simply documents the deployed schema.
--
-- COVERS
--   1. org_level enum: 'city'
--   2. import_batch: header/sample snapshot + upload-progress tracking columns
--   3. sales_fact: optional area_id / branch_id (distributor-by-city model)
--   4. agent: city_id + area_manager_id
--   5. user_scope: city_id (agent_id already shipped in 0005)
--   6. scope helper functions (my_area_ids / my_region_ids / my_agent_ids)
--   7. refreshed area-scope read policies that resolve city + agent scope
--   8. coverage_target  (+ RLS, admin-only writes, scoped reads)
--   9. capability_setup (+ RLS, admin-only writes, scoped reads)
--  10. reporting views: import_batch_totals, sla_actual_agent_month,
--      sla_performance, sla_coverage, sla_scorecard (security_invoker)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. org_level gains a 'city' level (distributor-by-city hierarchy)
-- ---------------------------------------------------------------------
alter type org_level add value if not exists 'city';

-- ---------------------------------------------------------------------
-- 2. import_batch — header/sample snapshot + resumable upload tracking
-- ---------------------------------------------------------------------
alter table import_batch add column if not exists source_headers          jsonb;
alter table import_batch add column if not exists sample_rows             jsonb;
alter table import_batch add column if not exists column_count            int;
alter table import_batch add column if not exists upload_status           text;
alter table import_batch add column if not exists uploaded_rows_count     int;
alter table import_batch add column if not exists total_rows_count        int;
alter table import_batch add column if not exists upload_progress_percent int;
alter table import_batch add column if not exists current_upload_stage    text;
alter table import_batch add column if not exists cancelled_by            uuid references profile(id);
alter table import_batch add column if not exists cancelled_at            timestamptz;
alter table import_batch add column if not exists failed_reason           text;
alter table import_batch add column if not exists last_successful_row_index int;
alter table import_batch add column if not exists completed_at            timestamptz;

-- ---------------------------------------------------------------------
-- 3. sales_fact — area/branch optional (distributors scoped by city)
-- ---------------------------------------------------------------------
alter table sales_fact alter column area_id   drop not null;
alter table sales_fact alter column branch_id drop not null;

-- ---------------------------------------------------------------------
-- 4. agent — direct city scope + responsible area manager
-- ---------------------------------------------------------------------
alter table agent add column if not exists city_id         uuid references city(id);
alter table agent add column if not exists area_manager_id uuid references profile(id);
create index if not exists agent_city_idx          on agent (city_id);
create index if not exists agent_area_manager_idx  on agent (area_manager_id);

-- ---------------------------------------------------------------------
-- 5. user_scope — city-level visibility assignment
-- ---------------------------------------------------------------------
alter table user_scope add column if not exists city_id uuid references city(id) on delete cascade;
create index if not exists user_scope_city_idx on user_scope (city_id);

-- ---------------------------------------------------------------------
-- 6. Scope helper functions (SECURITY DEFINER; used only by RLS)
--    Resolve region/area/city/branch/agent assignments to concrete ids.
-- ---------------------------------------------------------------------
create or replace function my_agent_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select ag.id from agent ag
  where exists (
    select 1 from user_scope s
    where s.user_id = auth.uid()
      and (
        s.agent_id = ag.id
        or (ag.city_id is not null and (
              s.city_id = ag.city_id
              or s.region_id = (select c.region_id from city c where c.id = ag.city_id)
           ))
        or (ag.branch_id is not null and (
              s.branch_id = ag.branch_id
              or s.area_id = (select b.area_id from branch b where b.id = ag.branch_id)
              or s.region_id = (select a.region_id from area a join branch b on b.area_id = a.id where b.id = ag.branch_id)
           ))
      )
  );
$$;

create or replace function my_area_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id
  from area a
  where exists (
    select 1 from user_scope s
    where s.user_id = auth.uid()
      and (
        s.area_id = a.id
        or s.region_id = a.region_id
        or s.city_id in (select c.id from city c where c.region_id = a.region_id)
        or s.branch_id in (select b.id from branch b where b.area_id = a.id)
        or s.agent_id in (
             select ag.id from agent ag
             left join branch b on b.id = ag.branch_id
             left join city   c on c.id = ag.city_id
             where b.area_id = a.id or c.region_id = a.region_id
        )
      )
  );
$$;

create or replace function my_region_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct a.region_id from area a where a.id in (select my_area_ids());
$$;

revoke execute on function my_agent_ids()  from anon, public;
revoke execute on function my_area_ids()   from anon, public;
revoke execute on function my_region_ids() from anon, public;
grant  execute on function my_agent_ids()  to authenticated;
grant  execute on function my_area_ids()   to authenticated;
grant  execute on function my_region_ids() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Refreshed scope reads (resolve city + agent assignments)
--    Drop-then-create so re-running this file stays clean.
-- ---------------------------------------------------------------------
drop policy if exists agent_read on agent;
create policy agent_read on agent for select to authenticated
  using (
    is_global()
    or branch_id in (select id from branch where area_id in (select my_area_ids()))
    or city_id in (
      select c.id from city c join area a on a.region_id = c.region_id
      where a.id in (select my_area_ids())
    )
  );

drop policy if exists region_read on region;
create policy region_read on region for select to authenticated
  using (is_global() or id in (select my_region_ids()));

drop policy if exists sales_fact_read on sales_fact;
create policy sales_fact_read on sales_fact for select to authenticated
  using (
    is_global()
    or agent_id in (select my_agent_ids())
    or region_id in (select my_region_ids())
  );

drop policy if exists import_batch_read on import_batch;
create policy import_batch_read on import_batch for select to authenticated
  using (is_global() or agent_id in (select my_agent_ids()));

drop policy if exists sla_target_read on sla_target;
create policy sla_target_read on sla_target for select to authenticated
  using (
    is_global()
    or area_id in (select my_area_ids())
    or (level = 'region' and region_id in (select my_region_ids()))
    or (level = 'agent'  and agent_id  in (select my_agent_ids()))
  );

-- ---------------------------------------------------------------------
-- 8. coverage_target — monthly coverage/productivity targets
--    Grain: region / city / agent (× channel). NULL channel = all channels.
-- ---------------------------------------------------------------------
create table if not exists coverage_target (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references company(id) on delete cascade,
  period_month               date not null,
  level                      org_level not null,
  region_id                  uuid references region(id),
  city_id                    uuid references city(id),
  agent_id                   uuid references agent(id),
  channel_id                 uuid references channel(id),
  required_customer_universe int,
  required_active_customers  int,
  required_coverage_pct      numeric(6,2),
  required_productive_pct    numeric(6,2),
  required_visits            int,
  created_by                 uuid references profile(id),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index if not exists coverage_target_period_idx on coverage_target (period_month, level);
create unique index if not exists coverage_target_unique on coverage_target (
  period_month, level,
  coalesce(region_id,  '00000000-0000-0000-0000-000000000000'),
  coalesce(city_id,    '00000000-0000-0000-0000-000000000000'),
  coalesce(agent_id,   '00000000-0000-0000-0000-000000000000'),
  coalesce(channel_id, '00000000-0000-0000-0000-000000000000')
);
alter table coverage_target enable row level security;

drop policy if exists coverage_target_read on coverage_target;
create policy coverage_target_read on coverage_target for select to authenticated
  using (
    is_global()
    or (level = 'region' and region_id in (select my_region_ids()))
    or (level = 'agent'  and agent_id  in (select my_agent_ids()))
    or (level = 'city'   and (select c.region_id from city c where c.id = coverage_target.city_id) in (select my_region_ids()))
  );
drop policy if exists coverage_target_write on coverage_target;
create policy coverage_target_write on coverage_target for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 9. capability_setup — monthly salesforce / asset readiness
--    Grain: region / city / agent.
-- ---------------------------------------------------------------------
create table if not exists capability_setup (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references company(id) on delete cascade,
  period_month         date not null,
  level                org_level not null,
  region_id            uuid references region(id),
  city_id              uuid references city(id),
  agent_id             uuid references agent(id),
  required_salesmen    int,
  actual_salesmen      int,
  warehouse_required   boolean not null default false,
  warehouse_available  boolean not null default false,
  cashvan_required     boolean not null default false,
  cashvan_available    boolean not null default false,
  supervisor_required  boolean not null default false,
  supervisor_available boolean not null default false,
  notes                text,
  created_by           uuid references profile(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists capability_setup_period_idx on capability_setup (period_month, level);
create unique index if not exists capability_setup_unique on capability_setup (
  period_month, level,
  coalesce(region_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(city_id,   '00000000-0000-0000-0000-000000000000'),
  coalesce(agent_id,  '00000000-0000-0000-0000-000000000000')
);
alter table capability_setup enable row level security;

drop policy if exists capability_setup_read on capability_setup;
create policy capability_setup_read on capability_setup for select to authenticated
  using (
    is_global()
    or (level = 'region' and region_id in (select my_region_ids()))
    or (level = 'agent'  and agent_id  in (select my_agent_ids()))
    or (level = 'city'   and (select c.region_id from city c where c.id = capability_setup.city_id) in (select my_region_ids()))
  );
drop policy if exists capability_setup_write on capability_setup;
create policy capability_setup_write on capability_setup for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- 10. Reporting views (all security_invoker so caller RLS applies)
-- ---------------------------------------------------------------------

-- Per-batch fact totals (used by the import batches screen).
create or replace view import_batch_totals as
select
  batch_id,
  count(*)                                     as fact_rows,
  sum(coalesce(sla_actual_value, 0))           as sla_total
from sales_fact
group by batch_id;

-- Monthly actuals at the finest target grain (agent × channel).
create or replace view sla_actual_agent_month as
select
  f.company_id,
  f.period_month,
  f.agent_id,
  f.branch_id,
  f.area_id,
  f.region_id,
  f.country_id,
  f.channel_id,
  sum(coalesce(f.sla_actual_value, f.net_sales_ex_vat, 0)) as actual_amount,
  sum(f.gross_sales_ex_vat) as gross_sales_ex_vat,
  sum(f.net_sales_ex_vat)   as net_sales_ex_vat,
  sum(f.returns_value)      as returns_value,
  sum(f.cash_discount)      as cash_discount,
  sum(f.sales_qty_cartons)  as actual_qty_cartons,
  sum(f.sales_qty_pieces)   as actual_qty_pieces,
  max(f.invoice_date)       as last_invoice_date
from sales_fact f
join import_batch b on b.id = f.batch_id and b.status = 'imported'
where f.invoice_status is null or f.invoice_status = 'posted'
group by f.company_id, f.period_month, f.agent_id, f.branch_id, f.area_id, f.region_id, f.country_id, f.channel_id;

-- Target vs actual at every level, per channel AND rolled up across channels.
create or replace view sla_performance as
with actual_rollup as (
  select period_month, 'company'::org_level as lvl, company_id as ent_id, channel_id, sum(actual_amount) as actual_amount
    from sla_actual_agent_month
   group by grouping sets ((period_month, company_id, channel_id), (period_month, company_id))
  union all
  select period_month, 'country'::org_level, country_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
   group by grouping sets ((period_month, country_id, channel_id), (period_month, country_id))
  union all
  select period_month, 'region'::org_level, region_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
   group by grouping sets ((period_month, region_id, channel_id), (period_month, region_id))
  union all
  select period_month, 'area'::org_level, area_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
   group by grouping sets ((period_month, area_id, channel_id), (period_month, area_id))
  union all
  select period_month, 'branch'::org_level, branch_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
   group by grouping sets ((period_month, branch_id, channel_id), (period_month, branch_id))
  union all
  select period_month, 'agent'::org_level, agent_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
   group by grouping sets ((period_month, agent_id, channel_id), (period_month, agent_id))
),
target_norm as (
  select id, company_id, period_month, level, channel_id, target_amount, working_days,
    case level
      when 'company' then company_id
      when 'country' then country_id
      when 'region'  then region_id
      when 'area'    then area_id
      when 'branch'  then branch_id
      when 'agent'   then agent_id
      else null::uuid
    end as ent_id
  from sla_target
),
calc as (
  select
    t.id as target_id, t.company_id, t.period_month, t.level, t.ent_id, t.channel_id, t.target_amount,
    coalesce(ar.actual_amount, 0) as actual_amount,
    greatest(current_date - t.period_month + 1, 0)::numeric as elapsed_days,
    extract(day from (t.period_month + interval '1 month - 1 day'))::numeric as days_in_month
  from target_norm t
  left join actual_rollup ar
    on  ar.period_month = t.period_month
   and ar.lvl          = t.level
   and ar.ent_id       = t.ent_id
   and ar.channel_id  is not distinct from t.channel_id
)
select
  target_id, company_id, period_month, level, ent_id, channel_id, target_amount, actual_amount,
  elapsed_days, days_in_month,
  greatest(target_amount - actual_amount, 0) as gap_amount,
  case when target_amount > 0 then round(100 * actual_amount / target_amount, 1) else null end as achievement_pct,
  round(100 * least(elapsed_days / nullif(days_in_month, 0), 1), 1) as pace_pct,
  case when elapsed_days >= days_in_month then null
       else round(greatest(target_amount - actual_amount, 0) / nullif(days_in_month - elapsed_days, 0), 2) end as required_run_rate,
  case
    when actual_amount >= target_amount then 'Achieved'
    when target_amount = 0 then 'On Track'
    when (100 * actual_amount / target_amount) >= 0.95 * (100 * least(elapsed_days / nullif(days_in_month, 0), 1)) then 'On Track'
    when (100 * actual_amount / target_amount) >= 0.80 * (100 * least(elapsed_days / nullif(days_in_month, 0), 1)) then 'At Risk'
    else 'Behind'
  end as status
from calc c;

-- Uploaded vs active (productive) customers per level/channel.
create or replace view sla_coverage as
with base as (
  select
    f.period_month, f.country_id, f.region_id, f.area_id, a.city_id, f.agent_id, f.channel_id, f.customer_code,
    max((coalesce(f.net_sales_ex_vat, 0) > 0)::int) as has_sales
  from sales_fact f
  join import_batch b on b.id = f.batch_id and b.status = 'imported'
  join agent a on a.id = f.agent_id
  where (f.invoice_status is null or f.invoice_status = 'posted') and f.customer_code is not null
  group by f.period_month, f.country_id, f.region_id, f.area_id, a.city_id, f.agent_id, f.channel_id, f.customer_code
)
select period_month, 'agent'::org_level as lvl, agent_id as ent_id, channel_id,
       count(distinct customer_code) as uploaded_customers,
       count(distinct customer_code) filter (where has_sales = 1) as active_customers
  from base group by grouping sets ((period_month, agent_id, channel_id), (period_month, agent_id))
union all
select period_month, 'region'::org_level, region_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, region_id, channel_id), (period_month, region_id))
union all
select period_month, 'city'::org_level, city_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, city_id, channel_id), (period_month, city_id))
union all
select period_month, 'area'::org_level, area_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, area_id, channel_id), (period_month, area_id))
union all
select period_month, 'country'::org_level, country_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, country_id, channel_id), (period_month, country_id));

-- Combined SLA & Coverage scorecard: weighted composite score + status band.
-- Weights: sales 40% · coverage 25% · active customers 15% · salesforce 10% · service 10%.
create or replace view sla_scorecard as
with cov_norm as (
  select period_month, level, channel_id,
    case level when 'region' then region_id when 'city' then city_id when 'agent' then agent_id else null::uuid end as ent_id,
    required_customer_universe, required_active_customers, required_coverage_pct, required_productive_pct, required_visits
  from coverage_target
),
cap_norm as (
  select period_month, level,
    case level when 'region' then region_id when 'city' then city_id when 'agent' then agent_id else null::uuid end as ent_id,
    required_salesmen, actual_salesmen, warehouse_required, warehouse_available,
    cashvan_required, cashvan_available, supervisor_required, supervisor_available
  from capability_setup
),
joined as (
  select
    s.company_id, s.period_month, s.level, s.ent_id, s.channel_id,
    s.target_amount as sales_target, s.actual_amount as actual_sales, s.achievement_pct as sales_ach_pct,
    s.gap_amount as sales_gap, s.status as sales_status,
    cv.uploaded_customers, cv.active_customers,
    ct.required_customer_universe, ct.required_active_customers, ct.required_coverage_pct,
    cp.required_salesmen, cp.actual_salesmen,
    cp.warehouse_required, cp.warehouse_available, cp.cashvan_required, cp.cashvan_available,
    cp.supervisor_required, cp.supervisor_available
  from sla_performance s
  left join sla_coverage cv on cv.period_month = s.period_month and cv.lvl = s.level and cv.ent_id = s.ent_id and cv.channel_id is not distinct from s.channel_id
  left join cov_norm ct on ct.period_month = s.period_month and ct.level = s.level and ct.ent_id = s.ent_id and ct.channel_id is not distinct from s.channel_id
  left join cap_norm cp on cp.period_month = s.period_month and cp.level = s.level and cp.ent_id = s.ent_id
),
comp as (
  select j.*,
    least(coalesce(j.sales_ach_pct, 0), 100) as sc_sales,
    case when coalesce(j.required_coverage_pct, 0) > 0 and coalesce(j.required_customer_universe, 0) > 0
         then least(100.0 * (100.0 * coalesce(j.active_customers, 0)::numeric / j.required_customer_universe) / j.required_coverage_pct, 100)
         else 0 end as sc_cov,
    case when coalesce(j.required_active_customers, 0) > 0
         then least(100.0 * coalesce(j.active_customers, 0)::numeric / j.required_active_customers, 100)
         else 0 end as sc_active,
    case when coalesce(j.required_salesmen, 0) > 0
         then least(100.0 * coalesce(j.actual_salesmen, 0)::numeric / j.required_salesmen, 100)
         else 0 end as sc_force,
    case when (coalesce(j.warehouse_required, false)::int + coalesce(j.cashvan_required, false)::int + coalesce(j.supervisor_required, false)::int) > 0
         then 100.0 * (
                (coalesce(j.warehouse_required, false) and coalesce(j.warehouse_available, false))::int
              + (coalesce(j.cashvan_required, false) and coalesce(j.cashvan_available, false))::int
              + (coalesce(j.supervisor_required, false) and coalesce(j.supervisor_available, false))::int
              )::numeric
              / (coalesce(j.warehouse_required, false)::int + coalesce(j.cashvan_required, false)::int + coalesce(j.supervisor_required, false)::int)
         else 100 end as sc_service
  from joined j
),
scored as (
  select c.*,
    case when coalesce(c.required_customer_universe, 0) > 0
         then round(100.0 * coalesce(c.active_customers, 0)::numeric / c.required_customer_universe, 1)
         else null end as actual_coverage_pct,
    greatest(coalesce(c.required_salesmen, 0) - coalesce(c.actual_salesmen, 0), 0) as salesmen_gap,
    round(0.40 * c.sc_sales + 0.25 * c.sc_cov + 0.15 * c.sc_active + 0.10 * c.sc_force + 0.10 * c.sc_service) as sla_score
  from comp c
)
select
  company_id, period_month, level, ent_id, channel_id,
  sales_target, actual_sales, sales_ach_pct, sales_gap, sales_status,
  uploaded_customers, active_customers, required_customer_universe, required_active_customers, required_coverage_pct,
  required_salesmen, actual_salesmen,
  warehouse_required, warehouse_available, cashvan_required, cashvan_available, supervisor_required, supervisor_available,
  sc_sales, sc_cov, sc_active, sc_force, sc_service,
  actual_coverage_pct, salesmen_gap, sla_score,
  case
    when sla_score >= 100 then 'Achieved'
    when sla_score >= 85  then 'On Track'
    when sla_score >= 70  then 'At Risk'
    when sla_score >= 50  then 'Behind'
    else 'Critical'
  end as sla_status
from scored s;

alter view import_batch_totals     set (security_invoker = on);
alter view sla_actual_agent_month  set (security_invoker = on);
alter view sla_performance         set (security_invoker = on);
alter view sla_coverage            set (security_invoker = on);
alter view sla_scorecard           set (security_invoker = on);
