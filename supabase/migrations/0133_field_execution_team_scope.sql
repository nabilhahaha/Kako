-- ============================================================================
-- 0133: Field Execution (FE-5d-3) — hierarchy/team scoping for managers
-- ----------------------------------------------------------------------------
-- Managers see only their OWN team (their reporting subtree via
-- erp_user_branches.reports_to), enforced server-side in every field-ops read
-- function — so URL-tampering can't reach another manager's team. Admins /
-- company owners / platform owners see all.
--   erp_fe_sees_all()  — true for admin/super/platform owner.
--   erp_fe_team()       — set of user ids in the caller's reporting subtree (incl
--                         self), the rep dimension every metric is scoped to.
-- Re-defines the perf engine + dashboard + score + customer functions to add the
-- team predicate on the rep dimension. Additive (no schema change).
-- ============================================================================

create or replace function erp_fe_sees_all()
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select (select erp_is_platform_owner()) or (select erp_is_super_admin())
      or (select erp_is_company_admin((select erp_user_company_id())));
$$;
revoke all on function erp_fe_sees_all() from public, anon; grant execute on function erp_fe_sees_all() to authenticated;

create or replace function erp_fe_team()
returns setof uuid language sql stable security definer set search_path to 'public','pg_temp' as $$
  with recursive t as (
    select (select auth.uid()) as uid
    union
    select ub.user_id from erp_user_branches ub join t on ub.reports_to = t.uid
  )
  select uid from t where uid is not null;
$$;
revoke all on function erp_fe_team() from public, anon; grant execute on function erp_fe_team() to authenticated;

-- ── Perf scope helpers (add the team predicate) ────────────────────────────
create or replace function erp_fe_perf_caps(p_level text, p_id text, p_from date, p_to date)
returns table(kind text, score numeric, vals jsonb, created_at timestamptz, region text, area text, branch_id uuid, route_id uuid, rep_id uuid, customer_id uuid)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select c.kind, c.score, s.values, c.created_at, b.region, b.area, cu.branch_id, vi.route_id, c.created_by, c.customer_id
  from erp_fe_captures c
  join erp_form_submissions s on s.id = c.submission_id
  left join erp_fe_visits vi on vi.id = c.visit_id
  left join erp_customers cu on cu.id = c.customer_id
  left join erp_branches b on b.id = cu.branch_id
  where c.company_id = (select erp_user_company_id()) and c.created_at::date between p_from and p_to
    and ((select erp_fe_sees_all()) or c.created_by in (select erp_fe_team()))
    and (case p_level
      when 'region' then b.region = p_id when 'area' then b.area = p_id
      when 'branch' then cu.branch_id = p_id::uuid when 'route' then vi.route_id = p_id::uuid
      when 'rep' then c.created_by = p_id::uuid when 'customer' then c.customer_id = p_id::uuid
      else true end);
$$;
revoke all on function erp_fe_perf_caps(text, text, date, date) from public, anon, authenticated;

create or replace function erp_fe_perf_stops(p_level text, p_id text, p_from date, p_to date)
returns table(plan_date date, visited boolean, missed boolean, compliant boolean, region text, area text, branch_id uuid, route_id uuid, rep_id uuid, customer_id uuid)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select p.plan_date, (s.status = 'visited'),
    (s.status = 'missed' or (s.status <> 'visited' and p.plan_date < current_date)),
    (s.status = 'visited' and vi.geofence_status = 'ok' and vi.checkin_at::date = p.plan_date),
    b.region, b.area, cu.branch_id, p.route_id, p.rep_id, s.customer_id
  from erp_fe_route_stops s
  join erp_fe_route_plans p on p.id = s.plan_id
  left join erp_fe_visits vi on vi.id = s.visit_id
  left join erp_customers cu on cu.id = s.customer_id
  left join erp_branches b on b.id = cu.branch_id
  where s.company_id = (select erp_user_company_id()) and s.due and p.status in ('published','in_progress','done')
    and p.plan_date between p_from and p_to
    and ((select erp_fe_sees_all()) or p.rep_id in (select erp_fe_team()))
    and (case p_level
      when 'region' then b.region = p_id when 'area' then b.area = p_id
      when 'branch' then cu.branch_id = p_id::uuid when 'route' then p.route_id = p_id::uuid
      when 'rep' then p.rep_id = p_id::uuid when 'customer' then s.customer_id = p_id::uuid
      else true end);
$$;
revoke all on function erp_fe_perf_stops(text, text, date, date) from public, anon, authenticated;

-- ── Coverage (team-scoped) ─────────────────────────────────────────────────
create or replace function erp_fe_coverage(p_from date, p_to date, p_group text default 'route')
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_grp text := coalesce(p_group, 'route'); v jsonb;
  v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return null; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  if v_grp not in ('day','route','rep','total') then v_grp := 'route'; end if;
  with stops as (
    select case v_grp when 'day' then to_char(p.plan_date,'YYYY-MM-DD') when 'route' then coalesce(rt.name,'—') when 'rep' then coalesce(pr.full_name,'—') else 'total' end as gkey,
      (s.status='visited') as visited, (s.status='missed' or (s.status<>'visited' and p.plan_date<current_date)) as missed,
      (s.status='visited' and vi.geofence_status='ok' and vi.checkin_at::date=p.plan_date) as compliant
    from erp_fe_route_stops s join erp_fe_route_plans p on p.id=s.plan_id
    left join erp_routes rt on rt.id=p.route_id left join erp_profiles pr on pr.id=p.rep_id left join erp_fe_visits vi on vi.id=s.visit_id
    where s.company_id=v_company and s.due and p.status in ('published','in_progress','done') and p.plan_date between p_from and p_to
      and (v_all or p.rep_id = any(v_team))),
  offplan as (
    select case v_grp when 'day' then to_char(v.checkin_at::date,'YYYY-MM-DD') when 'route' then coalesce(rt.name,'—') when 'rep' then coalesce(pr.full_name,'—') else 'total' end as gkey, count(*) as off_plan
    from erp_fe_visits v left join erp_routes rt on rt.id=v.route_id left join erp_profiles pr on pr.id=v.rep_id
    where v.company_id=v_company and v.plan_id is null and v.status in ('in_progress','completed') and v.checkin_at::date between p_from and p_to
      and (v_all or v.rep_id = any(v_team)) group by 1),
  agg as (select gkey, count(*) planned, count(*) filter (where visited) visited, count(*) filter (where missed) missed, count(*) filter (where compliant) compliant from stops group by gkey),
  merged as (select coalesce(a.gkey,o.gkey) gkey, coalesce(a.planned,0) planned, coalesce(a.visited,0) visited, coalesce(a.missed,0) missed, coalesce(a.compliant,0) compliant, coalesce(o.off_plan,0) off_plan from agg a full join offplan o on a.gkey=o.gkey)
  select jsonb_build_object('group', v_grp, 'from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object('planned', coalesce(sum(planned),0), 'visited', coalesce(sum(visited),0), 'missed', coalesce(sum(missed),0), 'off_plan', coalesce(sum(off_plan),0),
      'coverage_pct', case when coalesce(sum(planned),0)>0 then round(100.0*sum(visited)/sum(planned)) else 0 end,
      'compliance_pct', case when coalesce(sum(planned),0)>0 then round(100.0*sum(compliant)/sum(planned)) else 0 end) from merged),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('key', gkey, 'planned', planned, 'visited', visited, 'missed', missed, 'off_plan', off_plan,
      'coverage_pct', case when planned>0 then round(100.0*visited/planned) else 0 end, 'compliance_pct', case when planned>0 then round(100.0*compliant/planned) else 0 end) order by gkey) from merged), '[]'::jsonb)) into v;
  return v;
end; $$;

-- ── Coverage lists (team-scoped) ───────────────────────────────────────────
create or replace function erp_fe_coverage_lists(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return null; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'missed', coalesce((select jsonb_agg(j order by pd desc) from (
      select p.plan_date pd, jsonb_build_object('customer', c.name, 'customer_id', s.customer_id, 'route', rt.name, 'plan_date', p.plan_date) j
      from erp_fe_route_stops s join erp_fe_route_plans p on p.id=s.plan_id join erp_customers c on c.id=s.customer_id left join erp_routes rt on rt.id=p.route_id
      where s.company_id=v_company and s.due and (s.status='missed' or (s.status<>'visited' and p.plan_date<current_date)) and p.plan_date>=current_date-p_days
        and (v_all or p.rep_id = any(v_team)) order by p.plan_date desc limit 50) m), '[]'::jsonb),
    'due_soon', coalesce((select jsonb_agg(j order by nd) from (
      select nd, jsonb_build_object('customer', c.name, 'customer_id', f.customer_id, 'next_due', nd, 'frequency', f.frequency) j
      from erp_fe_customer_frequency f join erp_customers c on c.id=f.customer_id cross join lateral erp_fe_next_due(f.customer_id, current_date) as nd
      where f.company_id=v_company and f.active and nd is not null and nd<=current_date+p_days
        and (v_all or c.salesman_id = any(v_team) or (select rep_id from erp_routes where id=f.route_id) = any(v_team))
      order by nd limit 50) d), '[]'::jsonb)) into v;
  return v;
end; $$;

-- ── Trends (team-scoped) ───────────────────────────────────────────────────
create or replace function erp_fe_coverage_trend(p_from date, p_to date, p_bucket text default 'day', p_route uuid default null, p_rep uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_b text := coalesce(p_bucket,'day'); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  if v_b not in ('day','week','month') then v_b := 'day'; end if;
  with rows as (
    select (case v_b when 'week' then date_trunc('week',p.plan_date)::date when 'month' then date_trunc('month',p.plan_date)::date else p.plan_date end) bucket,
      (s.status='visited') visited, (s.status='missed' or (s.status<>'visited' and p.plan_date<current_date)) missed,
      (s.status='visited' and vi.geofence_status='ok' and vi.checkin_at::date=p.plan_date) compliant
    from erp_fe_route_stops s join erp_fe_route_plans p on p.id=s.plan_id left join erp_fe_visits vi on vi.id=s.visit_id
    where s.company_id=v_company and s.due and p.status in ('published','in_progress','done') and p.plan_date between p_from and p_to
      and (p_route is null or p.route_id=p_route) and (p_rep is null or p.rep_id=p_rep) and (v_all or p.rep_id = any(v_team))),
  agg as (select bucket, count(*) planned, count(*) filter (where visited) visited, count(*) filter (where missed) missed, count(*) filter (where compliant) compliant from rows group by bucket)
  select coalesce(jsonb_agg(jsonb_build_object('bucket', to_char(bucket,'YYYY-MM-DD'), 'planned', planned, 'visited', visited, 'missed', missed,
    'coverage_pct', case when planned>0 then round(100.0*visited/planned) else 0 end, 'compliance_pct', case when planned>0 then round(100.0*compliant/planned) else 0 end) order by bucket), '[]'::jsonb) into v from agg;
  return v;
end; $$;

create or replace function erp_fe_score_trend(p_from date, p_to date, p_bucket text default 'day', p_route uuid default null, p_rep uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_b text := coalesce(p_bucket,'day'); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  if v_b not in ('day','week','month') then v_b := 'day'; end if;
  with cap as (
    select (case v_b when 'week' then date_trunc('week',c.created_at)::date when 'month' then date_trunc('month',c.created_at)::date else c.created_at::date end) bucket, c.kind, c.score, s.values
    from erp_fe_captures c join erp_form_submissions s on s.id=c.submission_id left join erp_fe_visits v on v.id=c.visit_id
    where c.company_id=v_company and c.created_at::date between p_from and p_to
      and (p_route is null or v.route_id=p_route) and (p_rep is null or c.created_by=p_rep) and (v_all or c.created_by = any(v_team))),
  agg as (select bucket, count(*) filter (where kind='merchandising') mt, count(*) filter (where kind='merchandising' and values->>'planogram_compliance'='yes') mo,
      count(*) filter (where kind='competitor') competitor_count, avg(score) filter (where kind='survey' and score is not null) savg,
      count(*) filter (where kind='out_of_stock') oos_count, coalesce(sum(case values->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0) ow,
      count(*) filter (where kind='opportunity') opp_count, coalesce(sum((nullif(values->>'est_value',''))::numeric) filter (where kind='opportunity'),0) opp_value, count(*) captures from cap group by bucket),
  comp as (select bucket, mt merch_count, competitor_count, oos_count, opp_count, opp_value, captures,
      case when mt>0 then round(100.0*mo/mt) else null end merch, case when savg is not null then round(savg) else null end survey,
      case when oos_count>0 then greatest(0,100-least(100,ow)) else null end oos, case when opp_count>0 then least(100,50+opp_count*25) else null end opp from agg)
  select coalesce(jsonb_agg(jsonb_build_object('bucket', to_char(bucket,'YYYY-MM-DD'),
    'overall', (select round(avg(x)) from (values (merch),(case when survey is null then null else least(100,survey) end),(oos),(opp)) t(x) where x is not null),
    'merch_compliance', merch, 'survey_score', survey, 'oos_score', oos, 'opportunity_score', opp,
    'merch_count', merch_count, 'competitor_count', competitor_count, 'oos_count', oos_count, 'opportunity_count', opp_count, 'opportunity_value', opp_value, 'captures', captures) order by bucket), '[]'::jsonb) into v from comp;
  return v;
end; $$;

-- ── Execution scores (team-scoped) ─────────────────────────────────────────
create or replace function erp_fe_execution_scores(p_scope text, p_id uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_mt int; v_mo int; v_merch numeric; v_survey numeric; v_oos_count int; v_oos_w numeric; v_oos numeric;
  v_opp_count int; v_opp_value numeric; v_opp numeric; v_total int; v_overall numeric; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return null; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard')) or (select erp_matrix_has('customers','view'))) then raise exception 'forbidden'; end if;
  with cap as (select c.kind, c.score, s.values from erp_fe_captures c join erp_form_submissions s on s.id=c.submission_id left join erp_fe_visits v on v.id=c.visit_id
    where c.company_id=v_company and (p_from is null or c.created_at>=p_from) and (p_to is null or c.created_at<=p_to) and (v_all or c.created_by = any(v_team))
      and (case coalesce(p_scope,'company') when 'customer' then c.customer_id=p_id when 'route' then v.route_id=p_id when 'rep' then c.created_by=p_id when 'visit' then c.visit_id=p_id else true end))
  select count(*) filter (where kind='merchandising'), count(*) filter (where kind='merchandising' and values->>'planogram_compliance'='yes'),
    avg(score) filter (where kind='survey' and score is not null), count(*) filter (where kind='out_of_stock'),
    coalesce(sum(case values->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0),
    count(*) filter (where kind='opportunity'), coalesce(sum((nullif(values->>'est_value',''))::numeric) filter (where kind='opportunity'),0), count(*)
    into v_mt, v_mo, v_survey, v_oos_count, v_oos_w, v_opp_count, v_opp_value, v_total from cap;
  v_merch := case when v_mt>0 then round(100.0*v_mo/v_mt) else null end;
  v_oos := case when v_oos_count>0 then greatest(0,100-least(100,v_oos_w)) else null end;
  v_opp := case when v_opp_count>0 then least(100,50+v_opp_count*25) else null end;
  select round(avg(x)) into v_overall from (values (v_merch),(case when v_survey is null then null else least(100,v_survey) end),(v_oos),(v_opp)) t(x) where x is not null;
  return jsonb_build_object('scope', coalesce(p_scope,'company'), 'captures', v_total, 'merch_compliance', v_merch,
    'survey_score', case when v_survey is not null then round(v_survey) else null end, 'oos_score', v_oos, 'oos_count', v_oos_count,
    'opportunity_score', v_opp, 'opportunity_count', v_opp_count, 'opportunity_value', v_opp_value, 'overall', v_overall);
end; $$;

create or replace function erp_fe_execution_scores_by(p_group text, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_grp text := coalesce(p_group,'route'); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  if v_grp not in ('route','rep') then v_grp := 'route'; end if;
  with base as (
    select case v_grp when 'route' then v.route_id else c.created_by end gid, case v_grp when 'route' then coalesce(rt.name,'—') else coalesce(pr.full_name,'—') end gname,
      count(*) filter (where c.kind='merchandising') mt, count(*) filter (where c.kind='merchandising' and s.values->>'planogram_compliance'='yes') mo,
      count(*) filter (where c.kind='survey' and c.score is not null) scnt, avg(c.score) filter (where c.kind='survey' and c.score is not null) savg,
      count(*) filter (where c.kind='out_of_stock') ocnt, coalesce(sum(case s.values->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where c.kind='out_of_stock'),0) ow,
      count(*) filter (where c.kind='opportunity') pcnt, coalesce(sum((nullif(s.values->>'est_value',''))::numeric) filter (where c.kind='opportunity'),0) pval, count(*) total
    from erp_fe_captures c join erp_form_submissions s on s.id=c.submission_id left join erp_fe_visits v on v.id=c.visit_id left join erp_routes rt on rt.id=v.route_id left join erp_profiles pr on pr.id=c.created_by
    where c.company_id=v_company and (p_from is null or c.created_at>=p_from) and (p_to is null or c.created_at<=p_to) and (v_all or c.created_by = any(v_team)) group by 1,2),
  comp as (select gid, gname, total, ocnt oos_count, pcnt opp_count, pval, case when mt>0 then round(100.0*mo/mt) else null end merch, case when scnt>0 then round(savg) else null end survey,
      case when ocnt>0 then greatest(0,100-least(100,ow)) else null end oos, case when pcnt>0 then least(100,50+pcnt*25) else null end opp from base)
  select coalesce(jsonb_agg(jsonb_build_object('id', gid, 'name', gname, 'captures', total, 'merch_compliance', merch, 'survey_score', survey, 'oos_score', oos, 'oos_count', oos_count,
    'opportunity_score', opp, 'opportunity_count', opp_count, 'opportunity_value', pval,
    'overall', (select round(avg(x)) from (values (merch),(case when survey is null then null else least(100,survey) end),(oos),(opp)) t(x) where x is not null))
    order by (select round(avg(x)) from (values (merch),(case when survey is null then null else least(100,survey) end),(oos),(opp)) t(x) where x is not null) desc nulls last), '[]'::jsonb) into v from comp where gid is not null;
  return v;
end; $$;

-- ── Manager summary (team-scoped) ──────────────────────────────────────────
create or replace function erp_fe_manager_summary()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_today timestamptz := date_trunc('day', now()); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return null; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'today', (select jsonb_build_object('visits', count(*), 'completed', count(*) filter (where status='completed'), 'in_progress', count(*) filter (where status='in_progress'),
      'geofence_ok', count(*) filter (where geofence_status='ok'), 'geofence_violations', count(*) filter (where geofence_status='violation'),
      'customers_covered', count(distinct customer_id), 'avg_duration_min', coalesce(round(avg(duration_min) filter (where status='completed')),0))
      from erp_fe_visits where company_id=v_company and checkin_at>=v_today and (v_all or rep_id = any(v_team))),
    'alerts', coalesce((select jsonb_agg(a order by dist desc nulls last, ts desc) from (
      select v.distance_m dist, v.checkin_at ts, jsonb_build_object('visit_id', v.id, 'type', 'geofence', 'customer', c.name, 'customer_id', v.customer_id, 'distance_m', v.distance_m, 'reason', v.reason, 'rep', p.full_name, 'at', v.checkin_at) a
      from erp_fe_visits v join erp_customers c on c.id=v.customer_id left join erp_profiles p on p.id=v.rep_id
      where v.company_id=v_company and v.geofence_status='violation' and v.checkin_at>=now()-interval '7 days' and (v_all or v.rep_id = any(v_team))
      order by v.distance_m desc nulls last, v.checkin_at desc limit 20) s), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(r order by visits desc) from (
      select count(*) visits, jsonb_build_object('route', coalesce(rt.name,'—'), 'route_id', v.route_id, 'visits', count(*), 'completed', count(*) filter (where v.status='completed'), 'violations', count(*) filter (where v.geofence_status='violation')) r
      from erp_fe_visits v left join erp_routes rt on rt.id=v.route_id where v.company_id=v_company and v.checkin_at>=v_today and (v_all or v.rep_id = any(v_team)) group by rt.name, v.route_id) s), '[]'::jsonb)) into v;
  return v;
end; $$;

-- ── Customer detail (team-scoped) ──────────────────────────────────────────
create or replace function erp_fe_customer_visits(p_customer uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare c erp_customers; v_company uuid; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  select * into c from erp_customers where id=p_customer; if c.id is null then return '[]'::jsonb; end if;
  v_company := c.company_id;
  if not ((select erp_is_platform_owner()) or (v_company=(select erp_user_company_id()) and ((select erp_matrix_has('customers','view')) or (select erp_matrix_has('field_ops','view')) or (select erp_is_company_admin(v_company))))) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(j order by ts desc) from (
    select v.checkin_at ts, jsonb_build_object('id', v.id, 'status', v.status, 'checkin_at', v.checkin_at, 'checkout_at', v.checkout_at, 'geofence_status', v.geofence_status, 'distance_m', v.distance_m, 'duration_min', v.duration_min, 'reason', v.reason, 'rep', p.full_name,
      'score', (erp_fe_execution_scores('visit', v.id, null, null)->>'overall')) j
    from erp_fe_visits v left join erp_profiles p on p.id=v.rep_id where v.customer_id=p_customer and v.company_id=v_company and (v_all or v.rep_id = any(v_team))
    order by v.checkin_at desc limit greatest(1, least(p_limit,100))) s), '[]'::jsonb);
end; $$;

create or replace function erp_fe_customer_evidence(p_customer uuid, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare c erp_customers; v_company uuid; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  select * into c from erp_customers where id=p_customer; if c.id is null then return '[]'::jsonb; end if;
  v_company := c.company_id;
  if not ((select erp_is_platform_owner()) or (v_company=(select erp_user_company_id()) and ((select erp_matrix_has('customers','view')) or (select erp_matrix_has('field_ops','view')) or (select erp_is_company_admin(v_company))))) then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(j order by ts desc) from (
    select a.created_at ts, jsonb_build_object('id', a.id, 'entity', a.entity, 'file_path', a.file_path, 'mime_type', a.mime_type, 'created_at', a.created_at, 'kind', coalesce(cap.kind, case when a.entity='fe_visit' then 'visit' else 'capture' end)) j
    from erp_entity_attachments a left join erp_fe_captures cap on a.entity='fe_capture' and cap.id=nullif(a.record_id,'')::uuid left join erp_fe_visits fv on a.entity='fe_visit' and fv.id=nullif(a.record_id,'')::uuid
    where a.company_id=v_company and ((a.entity='fe_capture' and cap.customer_id=p_customer) or (a.entity='fe_visit' and fv.customer_id=p_customer))
      and (v_all or cap.created_by = any(v_team) or fv.rep_id = any(v_team))
    order by a.created_at desc limit greatest(1, least(p_limit,100))) s), '[]'::jsonb);
end; $$;

-- ============================================================================
-- ROLLBACK (manual): restore the pre-0133 (unscoped) bodies of the redefined
-- functions; drop erp_fe_team / erp_fe_sees_all.
-- ============================================================================
