-- ============================================================================
-- 0123: Field Execution (FE-3b) — coverage engine
-- ----------------------------------------------------------------------------
--   • erp_fe_coverage(from, to, group) — planned / visited / missed / off-plan /
--     coverage% / compliance%, grouped by day | route | rep | total. Missed is
--     computed lazily (due stop, unvisited, plan_date past) so figures are live
--     before any "close day". Dashboard-ready jsonb (totals + groups).
--   • erp_fe_close_plan(plan)          — finalizes a plan: marks unvisited due
--     stops missed, sets status=done, emits the fe_coverage_daily raw fact (so
--     weekly/monthly trend without recompute).
-- Definitions:
--   Coverage%   = Visited / Planned
--   Compliance% = (Visited on the planned day, within geofence) / Planned
-- Permission-aware (field_ops:view/dashboard or admin). Additive.
-- ============================================================================

create or replace function erp_fe_coverage(p_from date, p_to date, p_group text default 'route')
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_grp text := coalesce(p_group, 'route'); v jsonb;
begin
  if v_company is null then return null; end if;
  if not (
    (select erp_is_platform_owner())
    or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))
    or (select erp_is_company_admin(v_company))
  ) then raise exception 'forbidden'; end if;
  if v_grp not in ('day','route','rep','total') then v_grp := 'route'; end if;

  with stops as (
    select
      case v_grp
        when 'day'   then to_char(p.plan_date, 'YYYY-MM-DD')
        when 'route' then coalesce(rt.name, '—')
        when 'rep'   then coalesce(pr.full_name, '—')
        else 'total' end as gkey,
      (s.status = 'visited') as visited,
      (s.status = 'missed' or (s.status <> 'visited' and p.plan_date < current_date)) as missed,
      (s.status = 'visited' and vi.geofence_status = 'ok' and vi.checkin_at::date = p.plan_date) as compliant
    from erp_fe_route_stops s
    join erp_fe_route_plans p on p.id = s.plan_id
    left join erp_routes rt on rt.id = p.route_id
    left join erp_profiles pr on pr.id = p.rep_id
    left join erp_fe_visits vi on vi.id = s.visit_id
    where s.company_id = v_company and s.due
      and p.status in ('published','in_progress','done')
      and p.plan_date between p_from and p_to
  ),
  offplan as (
    select
      case v_grp
        when 'day'   then to_char(v.checkin_at::date, 'YYYY-MM-DD')
        when 'route' then coalesce(rt.name, '—')
        when 'rep'   then coalesce(pr.full_name, '—')
        else 'total' end as gkey,
      count(*) as off_plan
    from erp_fe_visits v
    left join erp_routes rt on rt.id = v.route_id
    left join erp_profiles pr on pr.id = v.rep_id
    where v.company_id = v_company and v.plan_id is null and v.status in ('in_progress','completed')
      and v.checkin_at::date between p_from and p_to
    group by 1
  ),
  agg as (
    select gkey, count(*) as planned,
           count(*) filter (where visited) as visited,
           count(*) filter (where missed) as missed,
           count(*) filter (where compliant) as compliant
    from stops group by gkey
  ),
  merged as (
    select coalesce(a.gkey, o.gkey) as gkey,
           coalesce(a.planned, 0) as planned, coalesce(a.visited, 0) as visited,
           coalesce(a.missed, 0) as missed, coalesce(a.compliant, 0) as compliant,
           coalesce(o.off_plan, 0) as off_plan
    from agg a full join offplan o on a.gkey = o.gkey
  )
  select jsonb_build_object(
    'group', v_grp, 'from', p_from, 'to', p_to,
    'totals', (select jsonb_build_object(
        'planned', coalesce(sum(planned), 0), 'visited', coalesce(sum(visited), 0),
        'missed', coalesce(sum(missed), 0), 'off_plan', coalesce(sum(off_plan), 0),
        'coverage_pct',   case when coalesce(sum(planned),0) > 0 then round(100.0 * sum(visited) / sum(planned)) else 0 end,
        'compliance_pct', case when coalesce(sum(planned),0) > 0 then round(100.0 * sum(compliant) / sum(planned)) else 0 end
      ) from merged),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'key', gkey, 'planned', planned, 'visited', visited, 'missed', missed, 'off_plan', off_plan,
        'coverage_pct',   case when planned > 0 then round(100.0 * visited / planned) else 0 end,
        'compliance_pct', case when planned > 0 then round(100.0 * compliant / planned) else 0 end
      ) order by gkey) from merged), '[]'::jsonb)
  ) into v;
  return v;
end; $$;
revoke all on function erp_fe_coverage(date, date, text) from public, anon;
grant execute on function erp_fe_coverage(date, date, text) to authenticated;

create or replace function erp_fe_close_plan(p_plan uuid)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); pl erp_fe_route_plans;
  v_planned int; v_visited int; v_missed int; v_pct int;
begin
  select * into pl from erp_fe_route_plans where id = p_plan;
  if pl.id is null then raise exception 'plan not found'; end if;
  if not (
    (select erp_is_platform_owner())
    or (pl.company_id = v_company and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(pl.company_id))))
  ) then raise exception 'forbidden'; end if;

  update erp_fe_route_stops set status = 'missed' where plan_id = p_plan and due and status = 'planned';
  update erp_fe_route_plans set status = 'done' where id = p_plan;

  select count(*) filter (where due), count(*) filter (where status = 'visited'), count(*) filter (where status = 'missed')
    into v_planned, v_visited, v_missed from erp_fe_route_stops where plan_id = p_plan;
  v_pct := case when v_planned > 0 then round(100.0 * v_visited / v_planned) else 0 end;

  perform erp_raw_emit('field_ops', 'fe_coverage_daily', jsonb_build_object(
    'company_id', pl.company_id, 'route_id', pl.route_id, 'user_id', pl.rep_id,
    'event_at', pl.plan_date::timestamptz, 'entity_type', 'fe_plan', 'entity_id', pl.id::text,
    'quantity', v_visited, 'planned', v_planned, 'missed', v_missed, 'coverage_pct', v_pct));

  return jsonb_build_object('plan_id', pl.id, 'planned', v_planned, 'visited', v_visited, 'missed', v_missed, 'coverage_pct', v_pct);
end; $$;
revoke all on function erp_fe_close_plan(uuid) from public, anon;
grant execute on function erp_fe_close_plan(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_coverage() and erp_fe_close_plan().
-- ============================================================================
