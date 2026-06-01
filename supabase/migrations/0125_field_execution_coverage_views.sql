-- ============================================================================
-- 0125: Field Execution (FE-3d) — coverage views, next-due, 360 adherence
-- ----------------------------------------------------------------------------
--   • erp_fe_next_due(customer, from)   — next date the customer is due.
--   • erp_fe_coverage_lists(days)        — recent MISSED customers + DUE-SOON
--     customers (drill-through lists for the dashboard).
--   • erp_customer_field_360 (redefined) — adds frequency, next_due, 30-day
--     adherence (fulfilled ÷ planned stops) for the customer field profile.
-- All permission-aware; additive.
-- ============================================================================

-- ── Next due date per the frequency rule (scan forward up to 60 days) ──────
create or replace function erp_fe_next_due(p_customer uuid, p_from date default current_date)
returns date language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare d date;
begin
  for i in 0..60 loop
    d := p_from + i;
    if erp_fe_customer_due(p_customer, d) then return d; end if;
  end loop;
  return null;
end; $$;
revoke all on function erp_fe_next_due(uuid, date) from public, anon;
grant execute on function erp_fe_next_due(uuid, date) to authenticated;

-- ── Dashboard lists: missed (recent) + due-soon customers ──────────────────
create or replace function erp_fe_coverage_lists(p_days integer default 7)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb;
begin
  if v_company is null then return null; end if;
  if not (
    (select erp_is_platform_owner()) or (select erp_matrix_has('field_ops','view'))
    or (select erp_matrix_has('field_ops','dashboard')) or (select erp_is_company_admin(v_company))
  ) then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'missed', coalesce((select jsonb_agg(j order by pd desc) from (
        select p.plan_date as pd, jsonb_build_object(
          'customer', c.name, 'customer_id', s.customer_id, 'route', rt.name, 'plan_date', p.plan_date
        ) j
        from erp_fe_route_stops s
        join erp_fe_route_plans p on p.id = s.plan_id
        join erp_customers c on c.id = s.customer_id
        left join erp_routes rt on rt.id = p.route_id
        where s.company_id = v_company and s.due
          and (s.status = 'missed' or (s.status <> 'visited' and p.plan_date < current_date))
          and p.plan_date >= current_date - p_days
        order by p.plan_date desc limit 50
      ) m), '[]'::jsonb),
    'due_soon', coalesce((select jsonb_agg(j order by nd) from (
        select nd, jsonb_build_object('customer', c.name, 'customer_id', f.customer_id, 'next_due', nd, 'frequency', f.frequency) j
        from erp_fe_customer_frequency f
        join erp_customers c on c.id = f.customer_id
        cross join lateral erp_fe_next_due(f.customer_id, current_date) as nd
        where f.company_id = v_company and f.active and nd is not null and nd <= current_date + p_days
        order by nd limit 50
      ) d), '[]'::jsonb)
  ) into v;
  return v;
end; $$;
revoke all on function erp_fe_coverage_lists(integer) from public, anon;
grant execute on function erp_fe_coverage_lists(integer) to authenticated;

-- ── Customer 360 field rollup (redefined): + frequency / next_due / adherence
create or replace function erp_customer_field_360(p_customer uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public','pg_temp' as $$
declare c erp_customers; v_company uuid; v_planned int; v_fulfilled int;
begin
  select * into c from erp_customers where id = p_customer;
  if c.id is null then return null; end if;
  v_company := c.company_id;
  if not (
    (select erp_is_platform_owner())
    or (v_company = (select erp_user_company_id())
        and ((select erp_matrix_has('customers','view')) or (select erp_is_company_admin(v_company))))
  ) then raise exception 'forbidden'; end if;

  select count(*) filter (where s.due), count(*) filter (where s.due and s.status = 'visited')
    into v_planned, v_fulfilled
    from erp_fe_route_stops s join erp_fe_route_plans p on p.id = s.plan_id
   where s.customer_id = p_customer and p.status in ('published','in_progress','done') and p.plan_date >= current_date - 30;

  return jsonb_build_object(
    'last_visit_at',         (select max(event_at) from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_visit_completed'),
    'visits_30d',            (select count(*)       from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_visit_completed' and event_at > now() - interval '30 days'),
    'last_geofence_status',  (select geofence_result from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_visit_checkin' order by event_at desc limit 1),
    'last_merch_at',         (select max(event_at)   from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_merchandising'),
    'last_competitor_price', (select amount          from erp_raw_facts where company_id=v_company and customer_id=p_customer and module='field_ops' and event_type='fe_competitor' order by event_at desc limit 1),
    'frequency',     (select frequency from erp_fe_customer_frequency where customer_id=p_customer and active),
    'next_due',      erp_fe_next_due(p_customer, current_date),
    'planned_30d',   coalesce(v_planned, 0),
    'fulfilled_30d', coalesce(v_fulfilled, 0),
    'adherence_pct', case when coalesce(v_planned,0) > 0 then round(100.0 * v_fulfilled / v_planned) else null end
  );
end; $$;
revoke all on function erp_customer_field_360(uuid) from public, anon;
grant execute on function erp_customer_field_360(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): restore the 0119 erp_customer_field_360; drop
-- erp_fe_coverage_lists and erp_fe_next_due.
-- ============================================================================
