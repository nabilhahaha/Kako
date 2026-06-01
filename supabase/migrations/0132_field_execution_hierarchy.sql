-- ============================================================================
-- 0132: Field Execution (FE-5d-3) — configurable drill hierarchy + perf engine
-- ----------------------------------------------------------------------------
-- A level-agnostic performance engine so the drill hierarchy is data-driven:
--   levels: company | region | area | branch | route | rep | customer
--   erp_fe_settings.hierarchy text[] — the ordered levels a company uses
--     (e.g. {branch,route,rep,customer} or {region,area,route,rep}).
--   erp_fe_perf(level,id,from,to,bucket) — node metrics (coverage/compliance/
--     execution + components/OOS/opportunity/merch) + coverage & score trends.
--   erp_fe_perf_children(level,id,child_level,from,to) — child nodes + overall +
--     coverage for the next drill level.
-- All scoped via two internal set-returning helpers that carry every dimension,
-- so any level filters/aggregates uniformly. Permission-aware. Additive.
-- ============================================================================

alter table erp_fe_settings add column if not exists hierarchy text[] not null default array['branch','route','rep','customer'];

-- ── Internal scope helpers (carry all dimensions) ──────────────────────────
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
    and (case p_level
      when 'region' then b.region = p_id when 'area' then b.area = p_id
      when 'branch' then cu.branch_id = p_id::uuid when 'route' then p.route_id = p_id::uuid
      when 'rep' then p.rep_id = p_id::uuid when 'customer' then s.customer_id = p_id::uuid
      else true end);
$$;
revoke all on function erp_fe_perf_stops(text, text, date, date) from public, anon, authenticated;

create or replace function erp_fe_perf_guard() returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select (select erp_is_platform_owner()) or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard')) or (select erp_is_company_admin((select erp_user_company_id())));
$$;

-- ── Node metrics + trends ───────────────────────────────────────────────────
create or replace function erp_fe_perf(p_level text, p_id text default null, p_from date default null, p_to date default null, p_bucket text default 'week')
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_b text := coalesce(p_bucket, 'week');
  v_from date := coalesce(p_from, current_date - 89); v_to date := coalesce(p_to, current_date);
  v_planned int; v_visited int; v_missed int; v_compliant int;
  v_mt int; v_mo int; v_survey numeric; v_oosc int; v_oosw numeric; v_oppc int; v_oppv numeric; v_caps int;
  v_merch numeric; v_oos numeric; v_opp numeric; v_overall numeric; v_name text;
begin
  if v_company is null then return null; end if;
  if not erp_fe_perf_guard() then raise exception 'forbidden'; end if;
  if v_b not in ('day','week','month') then v_b := 'week'; end if;

  select count(*), count(*) filter (where visited), count(*) filter (where missed), count(*) filter (where compliant)
    into v_planned, v_visited, v_missed, v_compliant from erp_fe_perf_stops(p_level, p_id, v_from, v_to);

  select count(*) filter (where kind='merchandising'),
         count(*) filter (where kind='merchandising' and vals->>'planogram_compliance'='yes'),
         avg(score) filter (where kind='survey' and score is not null),
         count(*) filter (where kind='out_of_stock'),
         coalesce(sum(case vals->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0),
         count(*) filter (where kind='opportunity'),
         coalesce(sum((nullif(vals->>'est_value',''))::numeric) filter (where kind='opportunity'),0),
         count(*)
    into v_mt, v_mo, v_survey, v_oosc, v_oosw, v_oppc, v_oppv, v_caps from erp_fe_perf_caps(p_level, p_id, v_from, v_to);

  v_merch := case when v_mt>0 then round(100.0*v_mo/v_mt) else null end;
  v_oos := case when v_oosc>0 then greatest(0,100-least(100,v_oosw)) else null end;
  v_opp := case when v_oppc>0 then least(100,50+v_oppc*25) else null end;
  select round(avg(x)) into v_overall from (values (v_merch),(case when v_survey is null then null else least(100, v_survey) end),(v_oos),(v_opp)) t(x) where x is not null;

  v_name := case p_level
    when 'company' then null when 'region' then p_id when 'area' then p_id
    when 'branch' then (select coalesce(name_ar,name) from erp_branches where id=p_id::uuid)
    when 'route' then (select name from erp_routes where id=p_id::uuid)
    when 'rep' then (select full_name from erp_profiles where id=p_id::uuid)
    when 'customer' then (select name from erp_customers where id=p_id::uuid) else null end;

  return jsonb_build_object(
    'level', p_level, 'id', p_id, 'name', v_name, 'from', v_from, 'to', v_to,
    'metrics', jsonb_build_object(
      'planned', v_planned, 'visited', v_visited, 'missed', v_missed,
      'coverage_pct', case when v_planned>0 then round(100.0*v_visited/v_planned) else 0 end,
      'compliance_pct', case when v_planned>0 then round(100.0*v_compliant/v_planned) else 0 end,
      'merch_compliance', v_merch, 'survey_score', case when v_survey is not null then round(v_survey) else null end,
      'oos_score', v_oos, 'oos_count', v_oosc, 'opportunity_score', v_opp, 'opportunity_count', v_oppc, 'opportunity_value', v_oppv,
      'merch_count', v_mt, 'overall', v_overall, 'captures', v_caps),
    'coverage_trend', coalesce((select jsonb_agg(jsonb_build_object('bucket', to_char(bk,'YYYY-MM-DD'),
        'coverage_pct', case when pl>0 then round(100.0*vs/pl) else 0 end, 'compliance_pct', case when pl>0 then round(100.0*cp/pl) else 0 end) order by bk)
      from (select (case v_b when 'day' then plan_date when 'month' then date_trunc('month',plan_date)::date else date_trunc('week',plan_date)::date end) bk,
              count(*) pl, count(*) filter (where visited) vs, count(*) filter (where compliant) cp
            from erp_fe_perf_stops(p_level,p_id,v_from,v_to) group by 1) q), '[]'::jsonb),
    'score_trend', coalesce((select jsonb_agg(jsonb_build_object('bucket', to_char(bk,'YYYY-MM-DD'),
        'merch_compliance', case when mt2>0 then round(100.0*mo2/mt2) else null end,
        'oos_count', oc, 'opportunity_count', pc, 'merch_count', mt2, 'competitor_count', cc) order by bk)
      from (select (case v_b when 'day' then created_at::date when 'month' then date_trunc('month',created_at)::date else date_trunc('week',created_at)::date end) bk,
              count(*) filter (where kind='merchandising') mt2,
              count(*) filter (where kind='merchandising' and vals->>'planogram_compliance'='yes') mo2,
              count(*) filter (where kind='competitor') cc,
              count(*) filter (where kind='out_of_stock') oc,
              count(*) filter (where kind='opportunity') pc
            from erp_fe_perf_caps(p_level,p_id,v_from,v_to) group by 1) q), '[]'::jsonb)
  );
end; $$;
revoke all on function erp_fe_perf(text, text, date, date, text) from public, anon;
grant execute on function erp_fe_perf(text, text, date, date, text) to authenticated;

-- ── Children at the next drill level ───────────────────────────────────────
create or replace function erp_fe_perf_children(p_level text, p_id text, p_child_level text, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_from date := coalesce(p_from, current_date - 89); v_to date := coalesce(p_to, current_date); v jsonb;
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not erp_fe_perf_guard() then raise exception 'forbidden'; end if;

  with caps as (select * from erp_fe_perf_caps(p_level, p_id, v_from, v_to)),
  stops as (select * from erp_fe_perf_stops(p_level, p_id, v_from, v_to)),
  ckey as (
    select case p_child_level when 'region' then region when 'area' then area when 'branch' then branch_id::text
             when 'route' then route_id::text when 'rep' then rep_id::text when 'customer' then customer_id::text end as gid,
      kind, score, vals from caps
  ),
  skey as (
    select case p_child_level when 'region' then region when 'area' then area when 'branch' then branch_id::text
             when 'route' then route_id::text when 'rep' then rep_id::text when 'customer' then customer_id::text end as gid,
      visited, compliant from stops
  ),
  capagg as (
    select gid,
      count(*) filter (where kind='merchandising') mt, count(*) filter (where kind='merchandising' and vals->>'planogram_compliance'='yes') mo,
      avg(score) filter (where kind='survey' and score is not null) savg,
      count(*) filter (where kind='out_of_stock') oosc,
      coalesce(sum(case vals->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0) oosw,
      count(*) filter (where kind='opportunity') oppc, count(*) captures
    from ckey where gid is not null group by gid
  ),
  covagg as (select gid, count(*) pl, count(*) filter (where visited) vs from skey where gid is not null group by gid),
  merged as (
    select coalesce(c.gid, v2.gid) gid,
      (case when c.mt>0 then round(100.0*c.mo/c.mt) else null end) merch,
      (case when c.savg is not null then round(c.savg) else null end) survey,
      (case when c.oosc>0 then greatest(0,100-least(100,c.oosw)) else null end) oos,
      (case when c.oppc>0 then least(100,50+c.oppc*25) else null end) opp,
      coalesce(c.captures,0) captures,
      coalesce(v2.pl,0) planned, coalesce(v2.vs,0) visited
    from capagg c full join covagg v2 on c.gid=v2.gid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gid,
    'name', case p_child_level
      when 'region' then gid when 'area' then gid
      when 'branch' then (select coalesce(name_ar,name) from erp_branches where id=gid::uuid)
      when 'route' then (select name from erp_routes where id=gid::uuid)
      when 'rep' then (select full_name from erp_profiles where id=gid::uuid)
      when 'customer' then (select name from erp_customers where id=gid::uuid) else gid end,
    'overall', (select round(avg(x)) from (values (merch),(case when survey is null then null else least(100, survey) end),(oos),(opp)) t(x) where x is not null),
    'coverage_pct', case when planned>0 then round(100.0*visited/planned) else 0 end,
    'captures', captures
  ) order by (select round(avg(x)) from (values (merch),(case when survey is null then null else least(100, survey) end),(oos),(opp)) t(x) where x is not null) desc nulls last), '[]'::jsonb)
  into v from merged where gid is not null;
  return v;
end; $$;
revoke all on function erp_fe_perf_children(text, text, text, date, date) from public, anon;
grant execute on function erp_fe_perf_children(text, text, text, date, date) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_perf_children, erp_fe_perf, erp_fe_perf_guard,
-- erp_fe_perf_stops, erp_fe_perf_caps; drop erp_fe_settings.hierarchy.
-- ============================================================================
