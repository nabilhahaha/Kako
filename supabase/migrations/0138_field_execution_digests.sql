-- ============================================================================
-- 0138: Field Execution (FE-5e-3) — scheduled management digests
-- ----------------------------------------------------------------------------
-- Action-focused digests, not just reporting. Built for the CALLING manager and
-- fully scope-aware: each recipient sees only their reporting subtree
-- (erp_fe_team) — supervisor → their reps, area/regional manager → their
-- subtree, executive/admin → all. The digest leads with what needs doing: open
-- alerts by severity, new since last digest, overdue, top-risk routes/reps, and
-- per-pillar summaries — each list item carries a direct drill-through href.
-- Regional/executive digests add Top-10 positive + Top-10 attention performers.
--
-- Cadence is advisory (kind → default window): supervisor/area daily, regional
-- weekly, executive monthly. No cron here (lazy/manual, like Close-day);
-- erp_fe_digest_run persists a run so "new since last digest" advances.
-- ============================================================================

create table if not exists erp_fe_digest_runs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  kind        text not null check (kind in ('supervisor','area','regional','executive')),
  recipient   uuid,                                  -- the manager the digest was built for (auth.uid)
  period_from timestamptz not null,
  period_to   timestamptz not null,
  since       timestamptz,                           -- "new since" reference used
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_fe_digest_runs_lookup on erp_fe_digest_runs(company_id, recipient, kind, created_at desc);
alter table erp_fe_digest_runs enable row level security;
drop policy if exists erp_fe_digest_runs_read on erp_fe_digest_runs;
create policy erp_fe_digest_runs_read on erp_fe_digest_runs for select using (
  (select erp_is_platform_owner()) or (company_id = (select erp_user_company_id()) and (recipient = (select auth.uid()) or (select erp_fe_sees_all()))));
drop policy if exists erp_fe_digest_runs_write on erp_fe_digest_runs;
create policy erp_fe_digest_runs_write on erp_fe_digest_runs for all using (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));

-- ── Build a scope-aware digest for the calling manager ─────────────────────
create or replace function erp_fe_digest(p_kind text default 'supervisor', p_since timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare
  v_company uuid := erp_user_company_id(); v_uid uuid := (select auth.uid());
  v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
  v_kind text := case when p_kind in ('supervisor','area','regional','executive') then p_kind else 'supervisor' end;
  v_to timestamptz := now();
  v_from timestamptz := now() - (case v_kind when 'regional' then interval '7 days' when 'executive' then interval '30 days' else interval '1 day' end);
  v_since timestamptz; v_fromd date; v_tod date; v jsonb; v_perf jsonb; v_target numeric := erp_fe_threshold('coverage_target_pct', v_company);
begin
  if v_company is null then return null; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  v_since := coalesce(p_since,
    (select max(created_at) from erp_fe_digest_runs where company_id = v_company and recipient = v_uid and kind = v_kind), v_from);
  v_fromd := v_from::date; v_tod := v_to::date;

  -- scoped open alerts (worklist) + scoped period facts
  with al as (
    select * from erp_fe_alerts a where a.company_id = v_company
      and (v_all or a.owner_id = v_uid or a.rep_id = any(v_team))),
  open_al as (select * from al where status in ('open','acknowledged','in_progress')),
  -- per-pillar period facts, scoped to the caller's reps
  stops as (select (st.status='visited') visited,
      (st.status='visited' and vi.geofence_status='ok' and vi.checkin_at::date=p.plan_date) compliant
    from erp_fe_route_stops st join erp_fe_route_plans p on p.id=st.plan_id left join erp_fe_visits vi on vi.id=st.visit_id
    where st.company_id=v_company and st.due and p.status in ('published','in_progress','done') and p.plan_date between v_fromd and v_tod
      and (v_all or p.rep_id = any(v_team))),
  vis as (select geofence_status from erp_fe_visits where company_id=v_company and checkin_at between v_from and v_to and (v_all or rep_id = any(v_team))),
  caps as (select c.kind, c.customer_id, s.values from erp_fe_captures c join erp_form_submissions s on s.id=c.submission_id
    where c.company_id=v_company and c.created_at between v_from and v_to and (v_all or c.created_by = any(v_team)))
  select jsonb_build_object(
    'kind', v_kind, 'generated_at', v_to, 'period_from', v_from, 'period_to', v_to, 'since', v_since,
    -- (1) open alerts by severity  (2) new since last digest  (3) overdue
    'alerts', jsonb_build_object(
      'open', (select count(*) from open_al), 'critical', (select count(*) from open_al where severity='critical'),
      'warning', (select count(*) from open_al where severity='warning'), 'info', (select count(*) from open_al where severity='info'),
      'unowned', (select count(*) from open_al where owner_id is null),
      'overdue', (select count(*) from open_al where due_date is not null and due_date < current_date),
      'new_since', (select count(*) from al where created_at >= v_since),
      'by_category', coalesce((select jsonb_object_agg(category, c) from (select category, count(*) c from open_al group by category) g), '{}'::jsonb)),
    'new_alerts', coalesce((select jsonb_agg(j order by sev, created_at desc) from (
      select (case severity when 'critical' then 0 when 'warning' then 1 else 2 end) sev, created_at,
        jsonb_build_object('id', id, 'title', title, 'severity', severity, 'category', category, 'created_at', created_at,
          'href', case when customer_id is not null then '/field/customers/'||customer_id when route_id is not null then '/field/perf/route/'||route_id
            when rep_id is not null then '/field/perf/rep/'||rep_id else '/field/alerts' end) j
      from al where created_at >= v_since order by sev, created_at desc limit 10) s), '[]'::jsonb),
    'overdue_alerts', coalesce((select jsonb_agg(j order by due_date) from (
      select due_date, jsonb_build_object('id', id, 'title', title, 'severity', severity, 'due_date', due_date, 'owner_id', owner_id,
        'href', case when customer_id is not null then '/field/customers/'||customer_id when route_id is not null then '/field/perf/route/'||route_id
          when rep_id is not null then '/field/perf/rep/'||rep_id else '/field/alerts' end) j
      from open_al where due_date is not null and due_date < current_date order by due_date limit 10) s), '[]'::jsonb),
    -- (4) top risk routes  (5) top risk reps  — by open-alert load, worst-severity first
    'top_risk_routes', coalesce((select jsonb_agg(j order by crit desc, total desc) from (
      select count(*) filter (where severity='critical') crit, count(*) total,
        jsonb_build_object('route_id', route_id, 'name', (select name from erp_routes where id=route_id), 'alerts', count(*),
          'critical', count(*) filter (where severity='critical'), 'href', '/field/perf/route/'||route_id) j
      from open_al where route_id is not null group by route_id order by crit desc, total desc limit 5) s), '[]'::jsonb),
    'top_risk_reps', coalesce((select jsonb_agg(j order by crit desc, total desc) from (
      select count(*) filter (where severity='critical') crit, count(*) total,
        jsonb_build_object('rep_id', rep_id, 'name', (select full_name from erp_profiles where id=rep_id), 'alerts', count(*),
          'critical', count(*) filter (where severity='critical'), 'href', '/field/perf/rep/'||rep_id) j
      from open_al where rep_id is not null group by rep_id order by crit desc, total desc limit 5) s), '[]'::jsonb),
    -- (6) coverage  (7) compliance  (8) OOS  (9) opportunity  (10) customer risk
    'coverage', (select jsonb_build_object('planned', count(*), 'visited', count(*) filter (where visited),
      'coverage_pct', case when count(*)>0 then round(100.0*count(*) filter (where visited)/count(*)) else 0 end,
      'compliance_pct', case when count(*)>0 then round(100.0*count(*) filter (where compliant)/count(*)) else 0 end, 'target', round(v_target)) from stops),
    'compliance', (select jsonb_build_object('visits', count(*), 'violations', count(*) filter (where geofence_status='violation'),
      'ok', count(*) filter (where geofence_status='ok'),
      'violation_pct', case when count(*)>0 then round(100.0*count(*) filter (where geofence_status='violation')/count(*)) else 0 end) from vis),
    'oos', (select jsonb_build_object('count', count(*) filter (where kind='out_of_stock'),
      'est_lost_sales', coalesce(sum((nullif(values->>'est_lost_sales',''))::numeric) filter (where kind='out_of_stock'),0),
      'customers', count(distinct customer_id) filter (where kind='out_of_stock')) from caps),
    'opportunity', (select jsonb_build_object('count', count(*) filter (where kind='opportunity'),
      'value', coalesce(sum((nullif(values->>'est_value',''))::numeric) filter (where kind='opportunity'),0),
      'high_value', count(*) filter (where kind='opportunity' and coalesce((nullif(values->>'est_value',''))::numeric,0) >= erp_fe_threshold('opportunity_value_high', v_company))) from caps),
    'customer_risk', jsonb_build_object('at_risk_customers', (select count(distinct customer_id) from open_al where category='customer_risk' and customer_id is not null),
      'alerts', (select count(*) from open_al where category='customer_risk'))
  ) into v;

  -- (regional/executive) Top-10 positive + Top-10 attention performers (scoped, weighted overall)
  if v_kind in ('regional','executive') then
    v_perf := erp_fe_execution_scores_by('rep');
    v := v || jsonb_build_object('performers', jsonb_build_object(
      'positive', coalesce((select jsonb_agg(jsonb_build_object('rep_id', e->>'id', 'name', e->>'name', 'overall', (e->>'overall')::numeric, 'href', '/field/perf/rep/'||(e->>'id')))
        from (select e from jsonb_array_elements(v_perf) e where (e->>'overall') is not null order by (e->>'overall')::numeric desc limit 10) z), '[]'::jsonb),
      'attention', coalesce((select jsonb_agg(jsonb_build_object('rep_id', e->>'id', 'name', e->>'name', 'overall', (e->>'overall')::numeric, 'href', '/field/perf/rep/'||(e->>'id')))
        from (select e from jsonb_array_elements(v_perf) e where (e->>'overall') is not null order by (e->>'overall')::numeric asc limit 10) z), '[]'::jsonb)));
  end if;
  return v;
end; $$;
revoke all on function erp_fe_digest(text, timestamptz) from public, anon; grant execute on function erp_fe_digest(text, timestamptz) to authenticated;

-- ── Build + persist a run (advances "new since last digest") ───────────────
create or replace function erp_fe_digest_run(p_kind text default 'supervisor')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb;
begin
  if v_company is null then raise exception 'forbidden'; end if;
  v := erp_fe_digest(p_kind, null);
  if v is null then return null; end if;
  insert into erp_fe_digest_runs (company_id, kind, recipient, period_from, period_to, since, payload)
    values (v_company, v->>'kind', (select auth.uid()), (v->>'period_from')::timestamptz, (v->>'period_to')::timestamptz, (v->>'since')::timestamptz, v);
  return v;
end; $$;
revoke all on function erp_fe_digest_run(text) from public, anon; grant execute on function erp_fe_digest_run(text) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_digest_run + erp_fe_digest; drop table
-- erp_fe_digest_runs.
-- ============================================================================
