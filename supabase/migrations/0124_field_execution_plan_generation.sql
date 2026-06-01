-- ============================================================================
-- 0124: Field Execution (FE-3c) — plan generation, publish, future-ready fields
-- ----------------------------------------------------------------------------
--   • priority (A/B/C) + est_duration_min on frequency rules and stops (future
--     route optimization inputs).
--   • erp_fe_generate_plan(route, date) — idempotent; (re)builds a draft plan's
--     stops from frequency-DUE customers on the route, ordered by priority then
--     name. Supervisor then reorders/skips/adds before publishing.
--   • erp_fe_publish_plan(plan) — publishes, notifies the rep (fe_route_published)
--     and emits a fe_visit_planned raw fact per due stop.
-- Additive + idempotent.
-- ============================================================================

alter table erp_fe_customer_frequency add column if not exists priority text check (priority in ('A','B','C')) default 'B';
alter table erp_fe_customer_frequency add column if not exists est_duration_min integer;
alter table erp_fe_route_stops       add column if not exists priority text check (priority in ('A','B','C')) default 'B';
alter table erp_fe_route_stops       add column if not exists est_duration_min integer;
-- Future-ready (route optimization / productivity / SLA tracking); no UI yet.
alter table erp_fe_route_stops       add column if not exists planned_arrival   timestamptz;
alter table erp_fe_route_stops       add column if not exists planned_departure timestamptz;

-- ── Generate / refresh a draft plan from frequency-due customers ───────────
create or replace function erp_fe_generate_plan(p_route uuid, p_date date)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_route erp_routes; v_plan uuid; v_added int := 0; v_total int;
begin
  if v_company is null then raise exception 'no company context'; end if;
  select * into v_route from erp_routes where id = p_route and company_id = v_company;
  if v_route.id is null then raise exception 'route not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(v_company))) then
    raise exception 'forbidden';
  end if;

  select id into v_plan from erp_fe_route_plans where company_id = v_company and route_id = p_route and plan_date = p_date;
  if v_plan is null then
    insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, generated_at, created_by)
    values (v_company, p_route, v_route.rep_id, p_date, 'draft', now(), auth.uid())
    returning id into v_plan;
  else
    update erp_fe_route_plans set generated_at = now() where id = v_plan;
  end if;

  -- add due customers on this route that aren't already stops
  insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, due, priority, est_duration_min)
  select v_company, v_plan, cu.id,
         row_number() over (order by case coalesce(f.priority,'B') when 'A' then 0 when 'B' then 1 else 2 end, cu.name),
         true, coalesce(f.priority, 'B'), f.est_duration_min
  from erp_customers cu
  join erp_fe_customer_frequency f on f.customer_id = cu.id and f.active
  where cu.company_id = v_company and (cu.route_id = p_route or f.route_id = p_route)
    and erp_fe_customer_due(cu.id, p_date)
    and not exists (select 1 from erp_fe_route_stops s where s.plan_id = v_plan and s.customer_id = cu.id);
  get diagnostics v_added = row_count;

  select count(*) into v_total from erp_fe_route_stops where plan_id = v_plan and due;
  return jsonb_build_object('plan_id', v_plan, 'added', v_added, 'stops', v_total);
end; $$;
revoke all on function erp_fe_generate_plan(uuid, date) from public, anon;
grant execute on function erp_fe_generate_plan(uuid, date) to authenticated;

-- ── Publish a plan: notify the rep + emit planned facts ────────────────────
create or replace function erp_fe_publish_plan(p_plan uuid)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); pl erp_fe_route_plans; st record; v_n int;
begin
  select * into pl from erp_fe_route_plans where id = p_plan;
  if pl.id is null then raise exception 'plan not found'; end if;
  if not ((select erp_is_platform_owner()) or (pl.company_id = v_company and ((select erp_matrix_has('field_ops','plan')) or (select erp_is_company_admin(pl.company_id))))) then
    raise exception 'forbidden';
  end if;

  update erp_fe_route_plans set status = 'published', published_at = now() where id = p_plan;

  if pl.rep_id is not null then
    perform erp_notify_send(pl.company_id, pl.rep_id, 'fe_route_published',
      jsonb_build_object('plan_date', pl.plan_date), '/field/route', 'fe_plan', pl.id::text);
  end if;

  for st in select id, customer_id from erp_fe_route_stops where plan_id = p_plan and due loop
    perform erp_raw_emit('field_ops', 'fe_visit_planned', jsonb_build_object(
      'company_id', pl.company_id, 'customer_id', st.customer_id, 'route_id', pl.route_id, 'user_id', pl.rep_id,
      'event_at', pl.plan_date::timestamptz, 'entity_type', 'fe_stop', 'entity_id', st.id::text));
  end loop;

  select count(*) into v_n from erp_fe_route_stops where plan_id = p_plan and due;
  return jsonb_build_object('plan_id', pl.id, 'published', true, 'stops', v_n);
end; $$;
revoke all on function erp_fe_publish_plan(uuid) from public, anon;
grant execute on function erp_fe_publish_plan(uuid) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_publish_plan, erp_fe_generate_plan; drop the
-- priority / est_duration_min columns on stops + frequency.
-- ============================================================================
