-- =====================================================================
-- Roshen KSA — 0010 SLA performance: support "all channels" targets
--
-- A target with channel_id NULL means "all channels". The previous
-- actual_rollup grouped actuals strictly by channel, so a NULL-channel
-- target never matched channel-specific actuals (actual showed 0).
--
-- Fix: actual_rollup now emits BOTH a per-channel row AND a channel-agnostic
-- (NULL) total per entity via GROUPING SETS. A channel-specific target matches
-- its channel row; an all-channels target matches the NULL total. No double
-- counting (each target matches exactly one rollup row).
--
-- Non-destructive: replaces a view only.
-- =====================================================================

create or replace view sla_performance as
with actual_rollup as (
  select period_month, 'company'::org_level lvl, company_id ent_id, channel_id, sum(actual_amount) actual_amount
    from sla_actual_agent_month
    group by grouping sets ((period_month, company_id, channel_id), (period_month, company_id))
  union all
  select period_month, 'country', country_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
    group by grouping sets ((period_month, country_id, channel_id), (period_month, country_id))
  union all
  select period_month, 'region', region_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
    group by grouping sets ((period_month, region_id, channel_id), (period_month, region_id))
  union all
  select period_month, 'area', area_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
    group by grouping sets ((period_month, area_id, channel_id), (period_month, area_id))
  union all
  select period_month, 'branch', branch_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
    group by grouping sets ((period_month, branch_id, channel_id), (period_month, branch_id))
  union all
  select period_month, 'agent', agent_id, channel_id, sum(actual_amount)
    from sla_actual_agent_month
    group by grouping sets ((period_month, agent_id, channel_id), (period_month, agent_id))
),
target_norm as (
  select
    id, company_id, period_month, level, channel_id, target_amount, working_days,
    case level
      when 'company' then company_id
      when 'country' then country_id
      when 'region'  then region_id
      when 'area'    then area_id
      when 'branch'  then branch_id
      when 'agent'   then agent_id
    end as ent_id
  from sla_target
),
calc as (
  select
    t.id as target_id, t.company_id, t.period_month, t.level, t.ent_id, t.channel_id, t.target_amount,
    coalesce(ar.actual_amount, 0) as actual_amount,
    greatest(current_date - t.period_month + 1, 0)::numeric                 as elapsed_days,
    extract(day from (t.period_month + interval '1 month - 1 day'))::numeric as days_in_month
  from target_norm t
  left join actual_rollup ar
    on  ar.period_month = t.period_month
   and ar.lvl          = t.level
   and ar.ent_id       = t.ent_id
   and ar.channel_id  is not distinct from t.channel_id
)
select
  c.*,
  greatest(c.target_amount - c.actual_amount, 0)                                  as gap_amount,
  case when c.target_amount > 0
       then round(100 * c.actual_amount / c.target_amount, 1) else null end       as achievement_pct,
  round(100 * least(c.elapsed_days / nullif(c.days_in_month,0), 1), 1)            as pace_pct,
  case when c.elapsed_days >= c.days_in_month then null
       else round(greatest(c.target_amount - c.actual_amount, 0)
                  / nullif(c.days_in_month - c.elapsed_days, 0), 2) end           as required_run_rate,
  case
    when c.actual_amount >= c.target_amount then 'Achieved'
    when c.target_amount = 0 then 'On Track'
    when (100 * c.actual_amount / c.target_amount)
         >= 0.95 * (100 * least(c.elapsed_days / nullif(c.days_in_month,0), 1)) then 'On Track'
    when (100 * c.actual_amount / c.target_amount)
         >= 0.80 * (100 * least(c.elapsed_days / nullif(c.days_in_month,0), 1)) then 'At Risk'
    else 'Behind'
  end                                                                             as status
from calc c;

alter view sla_performance set (security_invoker = on);
