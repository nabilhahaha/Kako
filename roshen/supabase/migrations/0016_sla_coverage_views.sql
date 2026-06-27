-- =====================================================================
-- Roshen KSA — 0016 SLA coverage + combined scorecard views
--
-- sla_coverage  : customer counts (uploaded / active) from imported sales_fact,
--                 rolled to company/country/region/area/city/agent x channel
--                 (+ channel-agnostic), Posted invoices only.
-- sla_scorecard : combines sales (sla_performance) + coverage actuals +
--                 coverage_target + capability_setup, and computes the weighted
--                 SLA Score + status band.
-- security_invoker keeps the caller's RLS. Views only — additive.
-- =====================================================================

create or replace view sla_coverage as
with base as (
  select
    f.period_month, f.country_id, f.region_id, f.area_id, a.city_id, f.agent_id, f.channel_id,
    f.customer_code,
    max((coalesce(f.net_sales_ex_vat, 0) > 0)::int) as has_sales
  from sales_fact f
  join import_batch b on b.id = f.batch_id and b.status = 'imported'
  join agent a on a.id = f.agent_id
  where (f.invoice_status is null or f.invoice_status = 'posted')
    and f.customer_code is not null
  group by 1,2,3,4,5,6,7,8
)
select period_month, 'agent'::org_level lvl, agent_id ent_id, channel_id,
       count(distinct customer_code) uploaded_customers,
       count(distinct customer_code) filter (where has_sales = 1) active_customers
  from base group by grouping sets ((period_month, agent_id, channel_id), (period_month, agent_id))
union all
select period_month, 'region', region_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, region_id, channel_id), (period_month, region_id))
union all
select period_month, 'city', city_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, city_id, channel_id), (period_month, city_id))
union all
select period_month, 'area', area_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, area_id, channel_id), (period_month, area_id))
union all
select period_month, 'country', country_id, channel_id,
       count(distinct customer_code), count(distinct customer_code) filter (where has_sales = 1)
  from base group by grouping sets ((period_month, country_id, channel_id), (period_month, country_id));

alter view sla_coverage set (security_invoker = on);

create or replace view sla_scorecard as
with cov_norm as (
  select period_month, level, channel_id,
    case level when 'region' then region_id when 'city' then city_id when 'agent' then agent_id end as ent_id,
    required_customer_universe, required_active_customers, required_coverage_pct, required_productive_pct, required_visits
  from coverage_target
),
cap_norm as (
  select period_month, level,
    case level when 'region' then region_id when 'city' then city_id when 'agent' then agent_id end as ent_id,
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
  left join sla_coverage cv on cv.period_month = s.period_month and cv.lvl = s.level and cv.ent_id = s.ent_id
       and cv.channel_id is not distinct from s.channel_id
  left join cov_norm ct on ct.period_month = s.period_month and ct.level = s.level and ct.ent_id = s.ent_id
       and ct.channel_id is not distinct from s.channel_id
  left join cap_norm cp on cp.period_month = s.period_month and cp.level = s.level and cp.ent_id = s.ent_id
),
comp as (
  select j.*,
    least(coalesce(j.sales_ach_pct, 0), 100)::numeric as sc_sales,
    case when coalesce(j.required_coverage_pct,0) > 0 and coalesce(j.required_customer_universe,0) > 0
         then least(100.0 * (100.0 * coalesce(j.active_customers,0) / j.required_customer_universe) / j.required_coverage_pct, 100)
         else 0 end as sc_cov,
    case when coalesce(j.required_active_customers,0) > 0
         then least(100.0 * coalesce(j.active_customers,0) / j.required_active_customers, 100) else 0 end as sc_active,
    case when coalesce(j.required_salesmen,0) > 0
         then least(100.0 * coalesce(j.actual_salesmen,0) / j.required_salesmen, 100) else 0 end as sc_force,
    case when (coalesce(j.warehouse_required,false)::int + coalesce(j.cashvan_required,false)::int + coalesce(j.supervisor_required,false)::int) > 0
         then 100.0 * (
              (coalesce(j.warehouse_required,false) and coalesce(j.warehouse_available,false))::int
            + (coalesce(j.cashvan_required,false) and coalesce(j.cashvan_available,false))::int
            + (coalesce(j.supervisor_required,false) and coalesce(j.supervisor_available,false))::int
           )::numeric / (coalesce(j.warehouse_required,false)::int + coalesce(j.cashvan_required,false)::int + coalesce(j.supervisor_required,false)::int)
         else 100 end as sc_service
  from joined j
),
scored as (
  select c.*,
    case when coalesce(c.required_customer_universe,0) > 0
         then round(100.0 * coalesce(c.active_customers,0) / c.required_customer_universe, 1) end as actual_coverage_pct,
    greatest(coalesce(c.required_salesmen,0) - coalesce(c.actual_salesmen,0), 0) as salesmen_gap,
    round(0.40*c.sc_sales + 0.25*c.sc_cov + 0.15*c.sc_active + 0.10*c.sc_force + 0.10*c.sc_service) as sla_score
  from comp c
)
select s.*,
  case
    when s.sla_score >= 100 then 'Achieved'
    when s.sla_score >= 85  then 'On Track'
    when s.sla_score >= 70  then 'At Risk'
    when s.sla_score >= 50  then 'Behind'
    else 'Critical'
  end as sla_status
from scored s;

alter view sla_scorecard set (security_invoker = on);
