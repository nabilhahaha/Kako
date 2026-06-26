-- =====================================================================
-- Roshen KSA Branch Management Platform
-- 0003 — SLA target vs actual model (views)  [PROPOSAL]
--
-- Actuals are aggregated from sales_fact (active 'imported' batches only).
-- Primary target grain is agent x channel x month; actuals roll up
-- automatically to branch, area, region, country, and company.
-- Performance views derive: achievement %, gap, required run-rate, pace,
-- and status band. Calendar days are used for MVP (selling-day ready).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Monthly actuals per agent + channel (the finest target grain).
-- Carries the full hierarchy (incl. company_id) so higher levels roll up.
-- ---------------------------------------------------------------------
-- SLA actual = sales_fact.sla_actual_value, which is resolved AT IMPORT per the
-- agent mapping version's calculation policy (sla_actual_basis). The policy —
-- not this view — decides whether the basis is sales_value_excl_vat,
-- gross_sales_ex_vat, or net_sales_ex_vat, so there is no universal hardcoded
-- rule and no risk of double deduction here.
-- Only Posted invoices count (Cancelled/Draft excluded; NULL treated as posted).
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
  sum(f.gross_sales_ex_vat)    as gross_sales_ex_vat,
  sum(f.net_sales_ex_vat)      as net_sales_ex_vat,
  sum(f.returns_value)         as returns_value,
  sum(f.cash_discount)         as cash_discount,
  sum(f.sales_qty_cartons)     as actual_qty_cartons,
  sum(f.sales_qty_pieces)      as actual_qty_pieces,
  max(f.invoice_date)          as last_invoice_date
from sales_fact f
join import_batch b on b.id = f.batch_id and b.status = 'imported'
where f.invoice_status is null or f.invoice_status = 'posted'
group by 1,2,3,4,5,6,7,8;

-- ---------------------------------------------------------------------
-- Generic roll-up: actual vs target at ANY level, with status band.
-- Targets at company/country/region/area/branch are matched to the SUM
-- of agent actuals beneath them; agent targets match directly.
-- ---------------------------------------------------------------------
create or replace view sla_performance as
with actual_rollup as (
  select period_month, 'company'::org_level lvl, company_id ent_id, channel_id,
         sum(actual_amount) actual_amount from sla_actual_agent_month group by 1,3,4
  union all
  select period_month, 'country', country_id, channel_id,
         sum(actual_amount) from sla_actual_agent_month group by 1,3,4
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
    t.id            as target_id,
    t.company_id,
    t.period_month,
    t.level,
    t.ent_id,
    t.channel_id,
    t.target_amount,
    coalesce(ar.actual_amount, 0) as actual_amount,
    -- calendar-day pace (selling-day calendar can replace these two lines later)
    greatest(current_date - t.period_month + 1, 0)::numeric                       as elapsed_days,
    extract(day from (t.period_month + interval '1 month - 1 day'))::numeric       as days_in_month
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

-- ---------------------------------------------------------------------
-- YTD helper: cumulative actual per agent+channel from Jan 1 of the year.
-- ---------------------------------------------------------------------
create or replace view sla_actual_agent_ytd as
select
  company_id,
  date_trunc('year', period_month)::date as year_start,
  agent_id, channel_id,
  sum(actual_amount) as ytd_actual_amount
from sla_actual_agent_month
group by 1,2,3,4;

-- Views must enforce the CALLER's RLS (not the view owner's). Without this,
-- Supabase flags them as SECURITY DEFINER views that bypass RLS.
alter view sla_actual_agent_month set (security_invoker = on);
alter view sla_performance        set (security_invoker = on);
alter view sla_actual_agent_ytd   set (security_invoker = on);
