-- ============================================================================
-- 0121: Field Execution (FE-2e) — manager visibility + customer visit timeline
-- ----------------------------------------------------------------------------
-- Read-only aggregates the manager dashboard and the customer field profile use:
--   • erp_fe_manager_summary()        — today KPIs + prioritized alerts + routes
--   • erp_fe_customer_visits(cust)     — a customer's recent visit timeline
-- Both are permission-aware (field_ops:view/dashboard or company admin) and
-- additive. Coverage here is "customers covered today"; plan-vs-actual coverage
-- arrives with route plans in FE-3. These functions are the data seam FE-5
-- dashboards build on.
-- ============================================================================

create or replace function erp_fe_manager_summary()
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_today timestamptz := date_trunc('day', now()); v jsonb;
begin
  if v_company is null then return null; end if;
  if not (
    (select erp_is_platform_owner())
    or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))
    or (select erp_is_company_admin(v_company))
  ) then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'today', (
      select jsonb_build_object(
        'visits',              count(*),
        'completed',           count(*) filter (where status = 'completed'),
        'in_progress',         count(*) filter (where status = 'in_progress'),
        'geofence_ok',         count(*) filter (where geofence_status = 'ok'),
        'geofence_violations', count(*) filter (where geofence_status = 'violation'),
        'customers_covered',   count(distinct customer_id),
        'avg_duration_min',    coalesce(round(avg(duration_min) filter (where status = 'completed')), 0)
      ) from erp_fe_visits where company_id = v_company and checkin_at >= v_today
    ),
    -- Prioritized alerts: geofence violations (last 7 days), worst distance first.
    'alerts', coalesce((
      select jsonb_agg(a order by dist desc nulls last, ts desc) from (
        select v.distance_m as dist, v.checkin_at as ts, jsonb_build_object(
          'visit_id', v.id, 'type', 'geofence', 'customer', c.name, 'customer_id', v.customer_id,
          'distance_m', v.distance_m, 'reason', v.reason, 'rep', p.full_name, 'at', v.checkin_at
        ) a
        from erp_fe_visits v
        join erp_customers c on c.id = v.customer_id
        left join erp_profiles p on p.id = v.rep_id
        where v.company_id = v_company and v.geofence_status = 'violation' and v.checkin_at >= now() - interval '7 days'
        order by v.distance_m desc nulls last, v.checkin_at desc limit 20
      ) s
    ), '[]'::jsonb),
    -- Route-level visibility for today.
    'routes', coalesce((
      select jsonb_agg(r order by visits desc) from (
        select count(*) as visits, jsonb_build_object(
          'route', coalesce(rt.name, '—'), 'route_id', v.route_id,
          'visits', count(*), 'completed', count(*) filter (where v.status = 'completed'),
          'violations', count(*) filter (where v.geofence_status = 'violation')
        ) r
        from erp_fe_visits v left join erp_routes rt on rt.id = v.route_id
        where v.company_id = v_company and v.checkin_at >= v_today
        group by rt.name, v.route_id
      ) s
    ), '[]'::jsonb)
  ) into v;
  return v;
end; $$;
revoke all on function erp_fe_manager_summary() from public, anon;
grant execute on function erp_fe_manager_summary() to authenticated;

create or replace function erp_fe_customer_visits(p_customer uuid, p_limit integer default 20)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare c erp_customers; v_company uuid;
begin
  select * into c from erp_customers where id = p_customer;
  if c.id is null then return '[]'::jsonb; end if;
  v_company := c.company_id;
  if not (
    (select erp_is_platform_owner())
    or (v_company = (select erp_user_company_id()) and (
      (select erp_matrix_has('customers','view')) or (select erp_matrix_has('field_ops','view')) or (select erp_is_company_admin(v_company))))
  ) then raise exception 'forbidden'; end if;

  return coalesce((
    select jsonb_agg(j order by ts desc) from (
      select v.checkin_at as ts, jsonb_build_object(
        'id', v.id, 'status', v.status, 'checkin_at', v.checkin_at, 'checkout_at', v.checkout_at,
        'geofence_status', v.geofence_status, 'distance_m', v.distance_m, 'duration_min', v.duration_min,
        'reason', v.reason, 'rep', p.full_name
      ) j
      from erp_fe_visits v left join erp_profiles p on p.id = v.rep_id
      where v.customer_id = p_customer and v.company_id = v_company
      order by v.checkin_at desc limit greatest(1, least(p_limit, 100))
    ) s
  ), '[]'::jsonb);
end; $$;
revoke all on function erp_fe_customer_visits(uuid, integer) from public, anon;
grant execute on function erp_fe_customer_visits(uuid, integer) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_manager_summary() and erp_fe_customer_visits().
-- ============================================================================
