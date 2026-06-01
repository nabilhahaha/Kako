-- ============================================================================
-- 0135: Field Execution (FE-5c) — configurable weighted scoring + states
-- ----------------------------------------------------------------------------
-- Weights AND component states are configurable WITHOUT code, resolved
-- most-specific-first:
--   rep override → route override → company default → industry-pack/global default
--   → fallback (weight 1, state 'optional').
-- Components: coverage, compliance, merchandising, oos, survey, opportunity.
--
-- Component STATE governs missing data (only for components present on a surface):
--   required  → missing data counts as 0 (a penalty — the pillar is mandatory).
--   optional  → missing data is EXCLUDED (no unfair penalty).
--   disabled  → never participates, even when data exists.
-- Overall = Σ(score·weight) / Σ(weight) over the PARTICIPATING components; the
-- drillable breakdown returns Component Score × Weight = Contribution per
-- component (+ its state). The breakdown/metrics shape is unchanged; only the
-- blend (weights + states) changes. This lets weights link to achievement %,
-- incentives and commission later without code changes.
-- ============================================================================

create table if not exists erp_fe_score_weights (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references erp_companies(id) on delete cascade,   -- null = global / industry-pack default
  pack        text,                                                   -- industry pack key (null = generic)
  scope_level text not null default 'company' check (scope_level in ('company','route','rep')),
  scope_id    uuid,                                                   -- route/rep id for overrides
  component   text not null check (component in ('coverage','compliance','merchandising','oos','survey','opportunity')),
  weight      numeric not null default 1 check (weight >= 0),
  state       text not null default 'optional' check (state in ('required','optional','disabled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (company_id, pack, scope_level, scope_id, component)
);
-- forward-compatible: add `state` if the table already existed without it
alter table erp_fe_score_weights add column if not exists state text not null default 'optional';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'erp_fe_score_weights_state_check') then
    alter table erp_fe_score_weights add constraint erp_fe_score_weights_state_check check (state in ('required','optional','disabled'));
  end if;
end $$;
alter table erp_fe_score_weights enable row level security;
drop policy if exists erp_fe_weights_read on erp_fe_score_weights;
create policy erp_fe_weights_read on erp_fe_score_weights for select using (
  company_id is null or (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_fe_weights_write on erp_fe_score_weights;
create policy erp_fe_weights_write on erp_fe_score_weights for all using (
  (select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id)))
) with check (
  (select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id))));
drop trigger if exists trg_audit_erp_fe_score_weights on erp_fe_score_weights;
create trigger trg_audit_erp_fe_score_weights after insert or update or delete on erp_fe_score_weights for each row execute function erp_audit_capture();
drop trigger if exists erp_fe_score_weights_updated on erp_fe_score_weights;
create trigger erp_fe_score_weights_updated before update on erp_fe_score_weights for each row execute function erp_set_updated_at();

-- Industry-pack default (FMCG) — the platform default weights + states.
-- Coverage/Compliance are required pillars; the rest optional (missing excluded).
insert into erp_fe_score_weights (company_id, pack, scope_level, component, weight, state) values
  (null,'fmcg','company','coverage',25,'required'),(null,'fmcg','company','compliance',20,'required'),
  (null,'fmcg','company','merchandising',20,'optional'),(null,'fmcg','company','oos',15,'optional'),
  (null,'fmcg','company','survey',10,'optional'),(null,'fmcg','company','opportunity',10,'optional')
on conflict do nothing;

-- ── Pure scoring helpers (state-aware) ─────────────────────────────────────
-- Only components whose key is PRESENT in p_components participate; that lets a
-- surface omit pillars it doesn't measure (e.g. capture-only scores omit
-- coverage/compliance) so they never trigger a "required-missing" penalty.
create or replace function erp_fe_weighted_overall(p_components jsonb, p_weights jsonb, p_states jsonb default '{}'::jsonb)
returns numeric language sql immutable as $$
  with c as (
    select k, (p_components->>k)::numeric raw, coalesce((p_weights->>k)::numeric, 0) weight, coalesce(p_states->>k,'optional') st
    from unnest(array['coverage','compliance','merchandising','oos','survey','opportunity']) k
    where p_components ? k),
  e as (select weight, (case when st='disabled' then null when raw is not null then raw when st='required' then 0 else null end) eff from c)
  select case when coalesce(sum(weight) filter (where eff is not null and weight>0),0) > 0
    then round(sum(eff*weight) filter (where eff is not null and weight>0) / sum(weight) filter (where eff is not null and weight>0))
    else null end from e;
$$;

create or replace function erp_fe_score_breakdown(p_components jsonb, p_weights jsonb, p_states jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $$
  with c as (
    select k, (p_components->>k)::numeric raw, coalesce((p_weights->>k)::numeric, 0) weight, coalesce(p_states->>k,'optional') st
    from unnest(array['coverage','compliance','merchandising','oos','survey','opportunity']) k
    where p_components ? k),
  e as (select k, weight, st, (case when st='disabled' then null when raw is not null then raw when st='required' then 0 else null end) eff from c),
  s as (select coalesce(sum(weight) filter (where eff is not null and weight>0), 0) sw from e)
  select coalesce(jsonb_agg(jsonb_build_object('component', k, 'score', eff, 'weight', weight, 'state', st,
    'contribution', case when eff is not null and weight>0 and (select sw from s) > 0 then round(eff*weight/(select sw from s), 1) else null end)
    order by array_position(array['coverage','compliance','merchandising','oos','survey','opportunity'], k)), '[]'::jsonb)
  from e;
$$;

-- ── Resolve weights / states for the company (+ optional route/rep override) ─
create or replace function erp_fe_resolve_weights(p_route uuid default null, p_rep uuid default null)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(jsonb_object_agg(k, w), '{}'::jsonb) from (
    select k, coalesce(
      (select weight from erp_fe_score_weights where company_id=(select erp_user_company_id()) and scope_level='rep' and scope_id=p_rep and component=k limit 1),
      (select weight from erp_fe_score_weights where company_id=(select erp_user_company_id()) and scope_level='route' and scope_id=p_route and component=k limit 1),
      (select weight from erp_fe_score_weights where company_id=(select erp_user_company_id()) and scope_level='company' and scope_id is null and component=k limit 1),
      (select weight from erp_fe_score_weights where company_id is null and scope_level='company' and component=k order by pack nulls last limit 1),
      1) w
    from unnest(array['coverage','compliance','merchandising','oos','survey','opportunity']) k) t;
$$;
revoke all on function erp_fe_resolve_weights(uuid, uuid) from public, anon; grant execute on function erp_fe_resolve_weights(uuid, uuid) to authenticated;

create or replace function erp_fe_resolve_states(p_route uuid default null, p_rep uuid default null)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(jsonb_object_agg(k, st), '{}'::jsonb) from (
    select k, coalesce(
      (select state from erp_fe_score_weights where company_id=(select erp_user_company_id()) and scope_level='rep' and scope_id=p_rep and component=k limit 1),
      (select state from erp_fe_score_weights where company_id=(select erp_user_company_id()) and scope_level='route' and scope_id=p_route and component=k limit 1),
      (select state from erp_fe_score_weights where company_id=(select erp_user_company_id()) and scope_level='company' and scope_id is null and component=k limit 1),
      (select state from erp_fe_score_weights where company_id is null and scope_level='company' and component=k order by pack nulls last limit 1),
      'optional') st
    from unnest(array['coverage','compliance','merchandising','oos','survey','opportunity']) k) t;
$$;
revoke all on function erp_fe_resolve_states(uuid, uuid) from public, anon; grant execute on function erp_fe_resolve_states(uuid, uuid) to authenticated;

-- ============================================================================
-- Wire the weighted overall + drillable breakdown into the scoring surfaces.
-- `overall` becomes Σ(score·weight)/Σ(weight) over the PARTICIPATING components;
-- the breakdown returns Component Score × Weight = Contribution (+ state).
-- Component scores, metrics shape and the drill structure are UNCHANGED.
-- Coverage/compliance keys are present only when there is a plan obligation
-- (planned>0), so a "required" coverage pillar never penalises a node that has
-- no published plan in the window. Capture pillars are always present (null when
-- no data) so a "required" capture pillar can penalise missing data.
-- ============================================================================

-- ── erp_fe_perf: weighted overall + top-level breakdown ────────────────────
create or replace function erp_fe_perf(p_level text, p_id text default null, p_from date default null, p_to date default null, p_bucket text default 'week', p_channel text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_b text := coalesce(p_bucket, 'week');
  v_from date := coalesce(p_from, current_date - 89); v_to date := coalesce(p_to, current_date);
  v_planned int; v_visited int; v_missed int; v_compliant int;
  v_mt int; v_mo int; v_survey numeric; v_oosc int; v_oosw numeric; v_oppc int; v_oppv numeric; v_caps int;
  v_merch numeric; v_oos numeric; v_opp numeric; v_overall numeric; v_name text;
  v_components jsonb; v_weights jsonb; v_states jsonb; v_breakdown jsonb;
begin
  if v_company is null then return null; end if;
  if not erp_fe_perf_guard() then raise exception 'forbidden'; end if;
  if v_b not in ('day','week','month') then v_b := 'week'; end if;

  select count(*), count(*) filter (where visited), count(*) filter (where missed), count(*) filter (where compliant)
    into v_planned, v_visited, v_missed, v_compliant from erp_fe_perf_stops(p_level, p_id, v_from, v_to, p_channel);
  select count(*) filter (where kind='merchandising'), count(*) filter (where kind='merchandising' and vals->>'planogram_compliance'='yes'),
    avg(score) filter (where kind='survey' and score is not null), count(*) filter (where kind='out_of_stock'),
    coalesce(sum(case vals->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0),
    count(*) filter (where kind='opportunity'), coalesce(sum((nullif(vals->>'est_value',''))::numeric) filter (where kind='opportunity'),0), count(*)
    into v_mt, v_mo, v_survey, v_oosc, v_oosw, v_oppc, v_oppv, v_caps from erp_fe_perf_caps(p_level, p_id, v_from, v_to, p_channel);

  v_merch := case when v_mt>0 then round(100.0*v_mo/v_mt) else null end;
  v_oos := case when v_oosc>0 then greatest(0,100-least(100,v_oosw)) else null end;
  v_opp := case when v_oppc>0 then least(100,50+v_oppc*25) else null end;
  v_weights := erp_fe_resolve_weights(case when p_level='route' then p_id::uuid else null end, case when p_level='rep' then p_id::uuid else null end);
  v_states := erp_fe_resolve_states(case when p_level='route' then p_id::uuid else null end, case when p_level='rep' then p_id::uuid else null end);
  -- capture pillars always present (null when no data); coverage/compliance only when there is a plan obligation
  v_components := jsonb_build_object('merchandising', v_merch, 'oos', v_oos,
      'survey', case when v_survey is null then null else least(100,v_survey) end, 'opportunity', v_opp)
    || case when v_planned>0 then jsonb_build_object('coverage', round(100.0*v_visited/v_planned), 'compliance', round(100.0*v_compliant/v_planned)) else '{}'::jsonb end;
  v_overall := erp_fe_weighted_overall(v_components, v_weights, v_states);
  v_breakdown := erp_fe_score_breakdown(v_components, v_weights, v_states);
  v_name := case p_level when 'company' then null when 'region' then p_id when 'area' then p_id
    when 'branch' then (select coalesce(name_ar,name) from erp_branches where id=p_id::uuid)
    when 'route' then (select name from erp_routes where id=p_id::uuid)
    when 'rep' then (select full_name from erp_profiles where id=p_id::uuid)
    when 'customer' then (select name from erp_customers where id=p_id::uuid) else null end;

  return jsonb_build_object('level', p_level, 'id', p_id, 'name', v_name, 'from', v_from, 'to', v_to, 'channel', p_channel,
    'metrics', jsonb_build_object('planned', v_planned, 'visited', v_visited, 'missed', v_missed,
      'coverage_pct', case when v_planned>0 then round(100.0*v_visited/v_planned) else 0 end,
      'compliance_pct', case when v_planned>0 then round(100.0*v_compliant/v_planned) else 0 end,
      'merch_compliance', v_merch, 'survey_score', case when v_survey is not null then round(v_survey) else null end,
      'oos_score', v_oos, 'oos_count', v_oosc, 'opportunity_score', v_opp, 'opportunity_count', v_oppc, 'opportunity_value', v_oppv,
      'merch_count', v_mt, 'overall', v_overall, 'captures', v_caps),
    'breakdown', v_breakdown, 'weights', v_weights, 'states', v_states,
    'coverage_trend', coalesce((select jsonb_agg(jsonb_build_object('bucket', to_char(bk,'YYYY-MM-DD'),
        'coverage_pct', case when pl>0 then round(100.0*vs/pl) else 0 end, 'compliance_pct', case when pl>0 then round(100.0*cp/pl) else 0 end) order by bk)
      from (select (case v_b when 'day' then plan_date when 'month' then date_trunc('month',plan_date)::date else date_trunc('week',plan_date)::date end) bk,
              count(*) pl, count(*) filter (where visited) vs, count(*) filter (where compliant) cp from erp_fe_perf_stops(p_level,p_id,v_from,v_to,p_channel) group by 1) q), '[]'::jsonb),
    'score_trend', coalesce((select jsonb_agg(jsonb_build_object('bucket', to_char(bk,'YYYY-MM-DD'),
        'merch_compliance', case when mt2>0 then round(100.0*mo2/mt2) else null end, 'oos_count', oc, 'opportunity_count', pc, 'merch_count', mt2, 'competitor_count', cc) order by bk)
      from (select (case v_b when 'day' then created_at::date when 'month' then date_trunc('month',created_at)::date else date_trunc('week',created_at)::date end) bk,
              count(*) filter (where kind='merchandising') mt2, count(*) filter (where kind='merchandising' and vals->>'planogram_compliance'='yes') mo2,
              count(*) filter (where kind='competitor') cc, count(*) filter (where kind='out_of_stock') oc, count(*) filter (where kind='opportunity') pc
            from erp_fe_perf_caps(p_level,p_id,v_from,v_to,p_channel) group by 1) q), '[]'::jsonb));
end; $$;

-- ── erp_fe_perf_children: weighted overall per child (coverage+compliance incl) ─
create or replace function erp_fe_perf_children(p_level text, p_id text, p_child_level text, p_from date default null, p_to date default null, p_channel text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_from date := coalesce(p_from, current_date - 89); v_to date := coalesce(p_to, current_date); v jsonb;
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not erp_fe_perf_guard() then raise exception 'forbidden'; end if;
  with caps as (select * from erp_fe_perf_caps(p_level, p_id, v_from, v_to, p_channel)),
  stops as (select * from erp_fe_perf_stops(p_level, p_id, v_from, v_to, p_channel)),
  ckey as (select case p_child_level when 'region' then region when 'area' then area when 'branch' then branch_id::text when 'route' then route_id::text when 'rep' then rep_id::text when 'customer' then customer_id::text end gid, kind, score, vals from caps),
  skey as (select case p_child_level when 'region' then region when 'area' then area when 'branch' then branch_id::text when 'route' then route_id::text when 'rep' then rep_id::text when 'customer' then customer_id::text end gid, visited, compliant from stops),
  capagg as (select gid, count(*) filter (where kind='merchandising') mt, count(*) filter (where kind='merchandising' and vals->>'planogram_compliance'='yes') mo,
      avg(score) filter (where kind='survey' and score is not null) savg, count(*) filter (where kind='out_of_stock') oosc,
      coalesce(sum(case vals->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0) oosw,
      count(*) filter (where kind='opportunity') oppc, count(*) captures from ckey where gid is not null group by gid),
  covagg as (select gid, count(*) pl, count(*) filter (where visited) vs, count(*) filter (where compliant) cp from skey where gid is not null group by gid),
  merged as (select coalesce(c.gid, v2.gid) gid, (case when c.mt>0 then round(100.0*c.mo/c.mt) else null end) merch, (case when c.savg is not null then round(c.savg) else null end) survey,
      (case when c.oosc>0 then greatest(0,100-least(100,c.oosw)) else null end) oos, (case when c.oppc>0 then least(100,50+c.oppc*25) else null end) opp,
      coalesce(c.captures,0) captures, coalesce(v2.pl,0) planned, coalesce(v2.vs,0) visited, coalesce(v2.cp,0) compliant from capagg c full join covagg v2 on c.gid=v2.gid),
  scored as (select gid, captures, planned, visited,
      erp_fe_weighted_overall(
        jsonb_build_object('merchandising', merch, 'oos', oos,
          'survey', case when survey is null then null else least(100,survey) end, 'opportunity', opp)
        || case when planned>0 then jsonb_build_object('coverage', round(100.0*visited/planned), 'compliance', round(100.0*compliant/planned)) else '{}'::jsonb end,
        erp_fe_resolve_weights(case when p_child_level='route' then gid::uuid else null end, case when p_child_level='rep' then gid::uuid else null end),
        erp_fe_resolve_states(case when p_child_level='route' then gid::uuid else null end, case when p_child_level='rep' then gid::uuid else null end)) ov
    from merged where gid is not null)
  select coalesce(jsonb_agg(jsonb_build_object('id', gid,
    'name', case p_child_level when 'region' then gid when 'area' then gid when 'branch' then (select coalesce(name_ar,name) from erp_branches where id=gid::uuid)
      when 'route' then (select name from erp_routes where id=gid::uuid) when 'rep' then (select full_name from erp_profiles where id=gid::uuid) when 'customer' then (select name from erp_customers where id=gid::uuid) else gid end,
    'overall', ov, 'coverage_pct', case when planned>0 then round(100.0*visited/planned) else 0 end, 'captures', captures)
    order by ov desc nulls last), '[]'::jsonb)
  into v from scored;
  return v;
end; $$;

-- ── erp_fe_execution_scores: weighted overall + breakdown (capture components) ─
create or replace function erp_fe_execution_scores(p_scope text, p_id uuid default null, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_mt int; v_mo int; v_merch numeric; v_survey numeric; v_oos_count int; v_oos_w numeric; v_oos numeric;
  v_opp_count int; v_opp_value numeric; v_opp numeric; v_total int; v_overall numeric; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_components jsonb; v_weights jsonb; v_states jsonb; v_scope text := coalesce(p_scope,'company');
begin
  if v_company is null then return null; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard')) or (select erp_matrix_has('customers','view'))) then raise exception 'forbidden'; end if;
  with cap as (select c.kind, c.score, s.values from erp_fe_captures c join erp_form_submissions s on s.id=c.submission_id left join erp_fe_visits v on v.id=c.visit_id
    where c.company_id=v_company and (p_from is null or c.created_at>=p_from) and (p_to is null or c.created_at<=p_to) and (v_all or c.created_by = any(v_team))
      and (case v_scope when 'customer' then c.customer_id=p_id when 'route' then v.route_id=p_id when 'rep' then c.created_by=p_id when 'visit' then c.visit_id=p_id else true end))
  select count(*) filter (where kind='merchandising'), count(*) filter (where kind='merchandising' and values->>'planogram_compliance'='yes'),
    avg(score) filter (where kind='survey' and score is not null), count(*) filter (where kind='out_of_stock'),
    coalesce(sum(case values->>'severity' when 'high' then 30 when 'medium' then 15 when 'low' then 5 else 10 end) filter (where kind='out_of_stock'),0),
    count(*) filter (where kind='opportunity'), coalesce(sum((nullif(values->>'est_value',''))::numeric) filter (where kind='opportunity'),0), count(*)
    into v_mt, v_mo, v_survey, v_oos_count, v_oos_w, v_opp_count, v_opp_value, v_total from cap;
  v_merch := case when v_mt>0 then round(100.0*v_mo/v_mt) else null end;
  v_oos := case when v_oos_count>0 then greatest(0,100-least(100,v_oos_w)) else null end;
  v_opp := case when v_opp_count>0 then least(100,50+v_opp_count*25) else null end;
  v_weights := erp_fe_resolve_weights(case when v_scope='route' then p_id else null end, case when v_scope='rep' then p_id else null end);
  v_states := erp_fe_resolve_states(case when v_scope='route' then p_id else null end, case when v_scope='rep' then p_id else null end);
  v_components := jsonb_build_object('merchandising', v_merch, 'oos', v_oos,
    'survey', case when v_survey is null then null else least(100,v_survey) end, 'opportunity', v_opp);
  v_overall := erp_fe_weighted_overall(v_components, v_weights, v_states);
  return jsonb_build_object('scope', v_scope, 'captures', v_total, 'merch_compliance', v_merch,
    'survey_score', case when v_survey is not null then round(v_survey) else null end, 'oos_score', v_oos, 'oos_count', v_oos_count,
    'opportunity_score', v_opp, 'opportunity_count', v_opp_count, 'opportunity_value', v_opp_value, 'overall', v_overall,
    'breakdown', erp_fe_score_breakdown(v_components, v_weights, v_states), 'weights', v_weights, 'states', v_states);
end; $$;

-- ── erp_fe_execution_scores_by: weighted overall + breakdown per group ──────
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
      case when ocnt>0 then greatest(0,100-least(100,ow)) else null end oos, case when pcnt>0 then least(100,50+pcnt*25) else null end opp from base),
  scored as (select c.*, jsonb_build_object('merchandising', merch, 'oos', oos,
        'survey', case when survey is null then null else least(100,survey) end, 'opportunity', opp) components,
      erp_fe_resolve_weights(case when v_grp='route' then gid else null end, case when v_grp='rep' then gid else null end) weights,
      erp_fe_resolve_states(case when v_grp='route' then gid else null end, case when v_grp='rep' then gid else null end) states from comp c)
  select coalesce(jsonb_agg(jsonb_build_object('id', gid, 'name', gname, 'captures', total, 'merch_compliance', merch, 'survey_score', survey, 'oos_score', oos, 'oos_count', oos_count,
    'opportunity_score', opp, 'opportunity_count', opp_count, 'opportunity_value', pval,
    'overall', erp_fe_weighted_overall(components, weights, states), 'breakdown', erp_fe_score_breakdown(components, weights, states))
    order by erp_fe_weighted_overall(components, weights, states) desc nulls last), '[]'::jsonb) into v from scored where gid is not null;
  return v;
end; $$;

-- ── erp_fe_score_trend: per-bucket overall also weighted (capture components) ─
create or replace function erp_fe_score_trend(p_from date, p_to date, p_bucket text default 'day', p_route uuid default null, p_rep uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_b text := coalesce(p_bucket,'day'); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_weights jsonb := erp_fe_resolve_weights(p_route, p_rep); v_states jsonb := erp_fe_resolve_states(p_route, p_rep);
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
    'overall', erp_fe_weighted_overall(jsonb_build_object('merchandising', merch, 'oos', oos,
        'survey', case when survey is null then null else least(100,survey) end, 'opportunity', opp), v_weights, v_states),
    'merch_compliance', merch, 'survey_score', survey, 'oos_score', oos, 'opportunity_score', opp,
    'merch_count', merch_count, 'competitor_count', competitor_count, 'oos_count', oos_count, 'opportunity_count', opp_count, 'opportunity_value', opp_value, 'captures', captures) order by bucket), '[]'::jsonb) into v from comp;
  return v;
end; $$;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_score_weights + the resolve/scoring helpers;
-- restore the 0133/0134 simple-average bodies of erp_fe_perf / _children /
-- erp_fe_execution_scores / _by / erp_fe_score_trend.
-- ============================================================================

-- ── No-code config: upsert this company's component weights + states ───────
-- Company admins (or platform owner) only; writes company-scoped rows that the
-- resolver then prefers over the industry-pack default. p_rows: array of
-- {component, weight, state}.
create or replace function erp_fe_save_weights(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); r jsonb; v_count int := 0;
begin
  if v_company is null then raise exception 'forbidden'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if (r->>'component') not in ('coverage','compliance','merchandising','oos','survey','opportunity') then continue; end if;
    insert into erp_fe_score_weights (company_id, pack, scope_level, scope_id, component, weight, state)
      values (v_company, null, 'company', null, r->>'component', greatest(0, coalesce((r->>'weight')::numeric, 1)),
              case when coalesce(r->>'state','optional') in ('required','optional','disabled') then r->>'state' else 'optional' end)
    on conflict (company_id, pack, scope_level, scope_id, component)
      do update set weight = excluded.weight, state = excluded.state, updated_at = now();
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('saved', v_count);
end; $$;
revoke all on function erp_fe_save_weights(jsonb) from public, anon; grant execute on function erp_fe_save_weights(jsonb) to authenticated;

-- ── Effective company config (resolved weights+states, + whether overridden) ─
create or replace function erp_fe_company_weights()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp' as $$
  select jsonb_build_object(
    'weights', erp_fe_resolve_weights(null, null),
    'states', erp_fe_resolve_states(null, null),
    'custom', exists(select 1 from erp_fe_score_weights where company_id = (select erp_user_company_id()) and scope_level='company' and scope_id is null));
$$;
revoke all on function erp_fe_company_weights() from public, anon; grant execute on function erp_fe_company_weights() to authenticated;

