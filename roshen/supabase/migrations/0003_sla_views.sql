-- =====================================================================
-- Roshen KSA Branch Management Platform
-- 0003 — SLA target vs actual model (views)  [PROPOSAL]
--
-- Actuals are aggregated from sales_fact (active 'imported' batches only).
-- Performance views join targets to actuals and derive the SLA metrics:
--   achievement %, gap, required run-rate, pace, and status band.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Monthly actuals per agent + channel (the finest target grain).
-- Higher-level actuals (branch/area/region/country) are SUMs of this.
-- ---------------------------------------------------------------------
create or replace view sla_actual_agent_month as
select
  f.period_month,
  f.agent_id,
  f.branch_id,
  f.area_id,
  f.region_id,
  f.country_id,
  f.channel_id,
  sum(f.net_amount)  as actual_amount,
  sum(f.quantity)    as actual_qty,
  max(f.txn_date)    as last_txn_date
from sales_fact f
join import_batch b on b.id = f.batch_id and b.status = 'imported'
group by 1,2,3,4,5,6,7;

-- ---------------------------------------------------------------------
-- Agent-level SLA performance (the building block for dashboards).
-- as_of_date defaults to today; metrics are MTD relative to that date.
-- ---------------------------------------------------------------------
create or replace view sla_performance_agent as
with t as (
  select * from sla_target where level = 'agent'
),
params as (
  select current_date as as_of
)
select
  t.period_month,
  t.agent_id,
  t.channel_id,
  ag.name        as agent_name,
  t.area_id,
  t.region_id,
  t.target_amount,
  coalesce(a.actual_amount, 0)                                   as actual_amount,
  coalesce(a.actual_amount, 0) - t.target_amount                as surplus_amount, -- negative = gap
  greatest(t.target_amount - coalesce(a.actual_amount, 0), 0)   as gap_amount,
  case when t.target_amount > 0
       then round(100 * coalesce(a.actual_amount,0) / t.target_amount, 1)
       else null end                                            as achievement_pct,
  t.working_days,
  -- elapsed / remaining selling days within the month (calendar approximation)
  least(
    greatest((select as_of from params) - t.period_month + 1, 0),
    extract(day from (t.period_month + interval '1 month - 1 day'))::int
  )                                                             as elapsed_days,
  extract(day from (t.period_month + interval '1 month - 1 day'))::int as days_in_month
from t
left join sla_actual_agent_month a
  on a.period_month = t.period_month
 and a.agent_id     = t.agent_id
 and a.channel_id is not distinct from t.channel_id
join agent ag on ag.id = t.agent_id;

-- ---------------------------------------------------------------------
-- Generic roll-up: actual vs target at ANY level, with status band.
-- Targets set at country/region/area/branch are matched to the SUM of
-- agent actuals beneath them; agent targets match directly.
-- ---------------------------------------------------------------------
create or replace view sla_performance as
with actual_rollup as (
  select period_month, 'country'::org_level lvl, country_id ent_id, channel_id,
         sum(actual_amount) actual_amount from sla_actual_agent_month group by 1,3,4
  union all
  select period_month, 'region', region_id, channel_id,
         sum(actual_amount) from sla_actual_agent_month group by 1,3,4
  union all
  select period_month, 'area', area_id, channel_id,
         sum(actual_amount) from sla_actual_agent_month group by 1,3,4
  union all
  select period_month, 'branch', branch_id, channel_id,
         sum(actual_amount) from sla_actual_agent_month group by 1,3,4
  union all
  select period_month, 'agent', agent_id, channel_id,
         sum(actual_amount) from sla_actual_agent_month group by 1,3,4
),
target_norm as (
  select id, period_month, level,
         coalesce(country_id, region_id, area_id, branch_id, agent_id) as ent_id,
         channel_id, target_amount, working_days
  from sla_target
)
select
  t.id            as target_id,
  t.period_month,
  t.level,
  t.ent_id,
  t.channel_id,
  t.target_amount,
  coalesce(ar.actual_amount, 0)                               as actual_amount,
  greatest(t.target_amount - coalesce(ar.actual_amount,0), 0) as gap_amount,
  case when t.target_amount > 0
       then round(100 * coalesce(ar.actual_amount,0) / t.target_amount, 1)
       else null end                                          as achievement_pct,
  -- expected-to-date pace as a fraction of the month elapsed (calendar based)
  round(100 * least(greatest(current_date - t.period_month + 1, 0)::numeric
        / nullif(extract(day from (t.period_month + interval '1 month - 1 day')), 0), 1), 1)
                                                              as pace_pct,
  -- required average per remaining day to still hit target
  case
    when current_date >= (t.period_month + interval '1 month - 1 day') then null
    else round(
      greatest(t.target_amount - coalesce(ar.actual_amount,0), 0)
      / nullif(extract(day from (t.period_month + interval '1 month - 1 day'))
               - greatest(current_date - t.period_month + 1, 0), 0), 2)
  end                                                         as required_run_rate,
  case
    when coalesce(ar.actual_amount,0) >= t.target_amount then 'Achieved'
    when t.target_amount = 0 then 'On Track'
    when (100 * coalesce(ar.actual_amount,0) / t.target_amount)
         >= 0.95 * (100 * least(greatest(current_date - t.period_month + 1,0)::numeric
              / nullif(extract(day from (t.period_month + interval '1 month - 1 day')),0),1))
         then 'On Track'
    when (100 * coalesce(ar.actual_amount,0) / t.target_amount)
         >= 0.80 * (100 * least(greatest(current_date - t.period_month + 1,0)::numeric
              / nullif(extract(day from (t.period_month + interval '1 month - 1 day')),0),1))
         then 'At Risk'
    else 'Behind'
  end                                                         as status
from target_norm t
left join actual_rollup ar
  on ar.period_month = t.period_month
 and ar.lvl          = t.level
 and ar.ent_id       = t.ent_id
 and ar.channel_id is not distinct from t.channel_id;

-- YTD helper: cumulative actual per agent+channel from Jan 1 of the period year.
create or replace view sla_actual_agent_ytd as
select
  date_trunc('year', period_month)::date as year_start,
  agent_id, channel_id,
  sum(actual_amount) as ytd_actual_amount
from sla_actual_agent_month
group by 1,2,3;
