-- ============================================================================
-- 0131: Field Execution (FE-5d-1) — trend + filter data layer
-- ----------------------------------------------------------------------------
--   • erp_fe_coverage_trend(from,to,bucket,route,rep) — coverage% + compliance%
--     per day/week, filterable by route and rep.
--   • erp_fe_score_trend(from,to,bucket,route,rep) — execution overall + component
--     scores + capture counts (merch/competitor/OOS/opportunity) per day/week.
--   Together they feed coverage/compliance/score/OOS/opportunity/merchandising
--   trends with date + route + rep filters. Permission-aware. Additive.
-- ============================================================================

create or replace function erp_fe_coverage_trend(p_from date, p_to date, p_bucket text default 'day', p_route uuid default null, p_rep uuid default null)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_b text := coalesce(p_bucket, 'day'); v jsonb;
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not ((select erp_is_platform_owner()) or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard')) or (select erp_is_company_admin(v_company))) then
    raise exception 'forbidden';
  end if;
  if v_b not in ('day','week') then v_b := 'day'; end if;

  with rows as (
    select
      (case v_b when 'week' then date_trunc('week', p.plan_date)::date else p.plan_date end) as bucket,
      (s.status = 'visited') as visited,
      (s.status = 'missed' or (s.status <> 'visited' and p.plan_date < current_date)) as missed,
      (s.status = 'visited' and vi.geofence_status = 'ok' and vi.checkin_at::date = p.plan_date) as compliant
    from erp_fe_route_stops s
    join erp_fe_route_plans p on p.id = s.plan_id
    left join erp_fe_visits vi on vi.id = s.visit_id
    where s.company_id = v_company and s.due and p.status in ('published','in_progress','done')
      and p.plan_date between p_from and p_to
      and (p_route is null or p.route_id = p_route)
      and (p_rep is null or p.rep_id = p_rep)
  ),
  agg as (
    select bucket, count(*) as planned, count(*) filter (where visited) as visited,
           count(*) filter (where missed) as missed, count(*) filter (where compliant) as compliant
    from rows group by bucket
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', to_char(bucket, 'YYYY-MM-DD'), 'planned', planned, 'visited', visited, 'missed', missed,
    'coverage_pct', case when planned > 0 then round(100.0 * visited / planned) else 0 end,
    'compliance_pct', case when planned > 0 then round(100.0 * compliant / planned) else 0 end
  ) order by bucket), '[]'::jsonb) into v from agg;
  return v;
end; $$;
revoke all on function erp_fe_coverage_trend(date, date, text, uuid, uuid) from public, anon;
grant execute on function erp_fe_coverage_trend(date, date, text, uuid, uuid) to authenticated;

create or replace function erp_fe_score_trend(p_from date, p_to date, p_bucket text default 'day', p_route uuid default null, p_rep uuid default null)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_b text := coalesce(p_bucket, 'day'); v jsonb;
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not ((select erp_is_platform_owner()) or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard')) or (select erp_is_company_admin(v_company))) then
    raise exception 'forbidden';
  end if;
  if v_b not in ('day','week') then v_b := 'day'; end if;

  with cap as (
    select
      (case v_b when 'week' then date_trunc('week', c.created_at)::date else c.created_at::date end) as bucket,
      c.kind, c.score, s.values
    from erp_fe_captures c
    join erp_form_submissions s on s.id = c.submission_id
    left join erp_fe_visits v on v.id = c.visit_id
    where c.company_id = v_company
      and c.created_at::date between p_from and p_to
      and (p_route is null or v.route_id = p_route)
      and (p_rep is null or c.created_by = p_rep)
  ),
  agg as (
    select bucket,
      count(*) filter (where kind='merchandising') as mt,
      count(*) filter (where kind='merchandising' and values->>'planogram_compliance'='yes') as mo,
      count(*) filter (where kind='competitor') as competitor_count,
      avg(score) filter (where kind='survey' and score is not null) as savg,
      count(*) filter (where kind='out_of_stock') as oos_count,
      coalesce(sum(case values->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0) as ow,
      count(*) filter (where kind='opportunity') as opp_count,
      coalesce(sum((nullif(values->>'est_value',''))::numeric) filter (where kind='opportunity'),0) as opp_value,
      count(*) as captures
    from cap group by bucket
  ),
  comp as (
    select bucket, mt as merch_count, competitor_count, oos_count, opp_count, opp_value, captures,
      case when mt>0 then round(100.0*mo/mt) else null end as merch,
      case when savg is not null then round(savg) else null end as survey,
      case when oos_count>0 then greatest(0,100-least(100,ow)) else null end as oos,
      case when opp_count>0 then least(100,50+opp_count*25) else null end as opp
    from agg
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'bucket', to_char(bucket,'YYYY-MM-DD'),
    'overall', (select round(avg(x)) from (values (merch),(least(100,survey)),(oos),(opp)) t(x) where x is not null),
    'merch_compliance', merch, 'survey_score', survey, 'oos_score', oos, 'opportunity_score', opp,
    'merch_count', merch_count, 'competitor_count', competitor_count, 'oos_count', oos_count,
    'opportunity_count', opp_count, 'opportunity_value', opp_value, 'captures', captures
  ) order by bucket), '[]'::jsonb) into v from comp;
  return v;
end; $$;
revoke all on function erp_fe_score_trend(date, date, text, uuid, uuid) from public, anon;
grant execute on function erp_fe_score_trend(date, date, text, uuid, uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_score_trend and erp_fe_coverage_trend.
-- ============================================================================
