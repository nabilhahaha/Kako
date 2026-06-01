-- ============================================================================
-- 0137: Field Execution (FE-5e-2) — detection rules + configurable thresholds
-- ----------------------------------------------------------------------------
-- Turns the FE-5e-1 alert spine into a worklist. Five rule families (coverage,
-- compliance, OOS, opportunity, customer risk) each compute severity, the
-- responsible OWNER (the rep's supervisor via reports_to — escalation to area /
-- regional / admin is future-ready via owner_level) and a due date, then call
-- the idempotent erp_fe_alert_raise — so a persisting condition UPDATES the open
-- alert (cooldown) instead of duplicating, while tracking aging metadata
-- (first_seen / last_seen / seen_count) for future SLA dashboards.
--
-- Thresholds are configurable per company WITHOUT code (erp_fe_alert_thresholds,
-- resolved company → global default → fallback): coverage target %, OOS repeat
-- count, missed-visit count, opportunity value, geofence-violation count, etc.
-- ============================================================================

-- ── Aging + multi-level ownership metadata (additive) ──────────────────────
alter table erp_fe_alerts add column if not exists first_seen_at timestamptz not null default now();
alter table erp_fe_alerts add column if not exists last_seen_at  timestamptz not null default now();
alter table erp_fe_alerts add column if not exists seen_count    integer not null default 1;
alter table erp_fe_alerts add column if not exists owner_level    text;   -- supervisor|area_manager|regional_manager|company_admin
alter table erp_fe_alerts add column if not exists escalation_level integer not null default 0;
alter table erp_fe_alerts add column if not exists escalated_at  timestamptz;

-- ── Configurable thresholds (company override → global default → fallback) ──
create table if not exists erp_fe_alert_thresholds (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references erp_companies(id) on delete cascade,   -- null = global default
  key        text not null,
  value      numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (company_id, key)
);
alter table erp_fe_alert_thresholds enable row level security;
drop policy if exists erp_fe_thresholds_read on erp_fe_alert_thresholds;
create policy erp_fe_thresholds_read on erp_fe_alert_thresholds for select using (
  company_id is null or (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));
drop policy if exists erp_fe_thresholds_write on erp_fe_alert_thresholds;
create policy erp_fe_thresholds_write on erp_fe_alert_thresholds for all using (
  (select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id)))
) with check ((select erp_is_platform_owner()) or (company_id is not null and (select erp_is_company_admin(company_id))));
drop trigger if exists trg_audit_erp_fe_alert_thresholds on erp_fe_alert_thresholds;
create trigger trg_audit_erp_fe_alert_thresholds after insert or update or delete on erp_fe_alert_thresholds for each row execute function erp_audit_capture();
drop trigger if exists erp_fe_alert_thresholds_updated on erp_fe_alert_thresholds;
create trigger erp_fe_alert_thresholds_updated before update on erp_fe_alert_thresholds for each row execute function erp_set_updated_at();

insert into erp_fe_alert_thresholds (company_id, key, value) values
  (null,'coverage_target_pct',80),(null,'oos_repeat_count',3),(null,'missed_visit_count',2),
  (null,'opportunity_value_high',1000),(null,'geofence_violation_count',3),
  (null,'declining_score_drop',10),(null,'declining_coverage_drop',10),(null,'opp_unfollowed_days',7)
on conflict do nothing;

create or replace function erp_fe_threshold(p_key text, p_company uuid)
returns numeric language sql stable security definer set search_path to 'public','pg_temp' as $$
  select coalesce(
    (select value from erp_fe_alert_thresholds where company_id = p_company and key = p_key limit 1),
    (select value from erp_fe_alert_thresholds where company_id is null and key = p_key limit 1),
    case p_key when 'coverage_target_pct' then (select coverage_target_pct from erp_fe_settings where company_id = p_company) end,
    case p_key when 'coverage_target_pct' then 80 when 'oos_repeat_count' then 3 when 'missed_visit_count' then 2
      when 'opportunity_value_high' then 1000 when 'geofence_violation_count' then 3
      when 'declining_score_drop' then 10 when 'declining_coverage_drop' then 10 when 'opp_unfollowed_days' then 7 else 0 end);
$$;
revoke all on function erp_fe_threshold(text, uuid) from public, anon; grant execute on function erp_fe_threshold(text, uuid) to authenticated;

-- ── Responsible manager = the rep's supervisor (reports_to). Escalation later. ─
create or replace function erp_fe_responsible_manager(p_rep uuid)
returns uuid language sql stable security definer set search_path to 'public','pg_temp' as $$
  select reports_to from erp_user_branches where user_id = p_rep and reports_to is not null order by is_default desc nulls last limit 1;
$$;
revoke all on function erp_fe_responsible_manager(uuid) from public, anon; grant execute on function erp_fe_responsible_manager(uuid) to authenticated;

-- ── Upgrade raise: aging metadata (first/last seen + seen_count) + owner_level ─
drop function if exists erp_fe_alert_raise(text,text,text,text,text,text,jsonb,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,date,uuid);
create function erp_fe_alert_raise(
  p_category text, p_rule_key text, p_dedupe text, p_title text,
  p_severity text default 'warning', p_scope_level text default null, p_details jsonb default '{}'::jsonb,
  p_metric numeric default null, p_region text default null, p_area text default null, p_branch uuid default null,
  p_route uuid default null, p_rep uuid default null, p_customer uuid default null, p_sku text default null,
  p_owner uuid default null, p_due date default null, p_company uuid default null, p_owner_level text default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := coalesce(p_company, erp_user_company_id()); v_id uuid;
begin
  if v_company is null then raise exception 'no company'; end if;
  insert into erp_fe_alerts (company_id, category, rule_key, severity, scope_level, region, area, branch_id, route_id, rep_id, customer_id, sku,
    title, details, metric, owner_id, owner_level, due_date, dedupe_key, created_by, first_seen_at, last_seen_at, seen_count)
  values (v_company, p_category, p_rule_key, coalesce(p_severity,'warning'), p_scope_level, p_region, p_area, p_branch, p_route, p_rep, p_customer, p_sku,
    p_title, coalesce(p_details,'{}'::jsonb), p_metric, p_owner, p_owner_level, p_due, p_dedupe, (select auth.uid()), now(), now(), 1)
  on conflict (company_id, rule_key, dedupe_key) where status in ('open','acknowledged','in_progress')
  do update set severity = excluded.severity, title = excluded.title, details = excluded.details, metric = excluded.metric,
    region = excluded.region, area = excluded.area, branch_id = excluded.branch_id, route_id = excluded.route_id,
    rep_id = excluded.rep_id, customer_id = excluded.customer_id, sku = excluded.sku,
    owner_id = coalesce(erp_fe_alerts.owner_id, excluded.owner_id),
    owner_level = coalesce(erp_fe_alerts.owner_level, excluded.owner_level),
    due_date = coalesce(erp_fe_alerts.due_date, excluded.due_date),
    last_seen_at = now(), seen_count = erp_fe_alerts.seen_count + 1, updated_at = now()   -- cooldown: refresh, don't duplicate
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function erp_fe_alert_raise(text,text,text,text,text,text,jsonb,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,date,uuid,text) from public, anon;
grant execute on function erp_fe_alert_raise(text,text,text,text,text,text,jsonb,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,date,uuid,text) to authenticated;

-- ── Detection rule families (internal; run by the orchestrator as owner) ────
-- Each returns the number of alerts raised/refreshed. due = created + (critical 1 /
-- warning 3 / info 7 days). owner = rep's supervisor (owner_level 'supervisor').

-- 1) COVERAGE — route / rep / area below the configurable target.
create or replace function erp_fe_rule_coverage(p_company uuid, p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_target numeric := erp_fe_threshold('coverage_target_pct', p_company); n int := 0; m int;
begin
  with s as (select p.route_id, p.rep_id, b.area, count(*) planned, count(*) filter (where st.status='visited') visited
    from erp_fe_route_stops st join erp_fe_route_plans p on p.id = st.plan_id
    left join erp_customers cu on cu.id = st.customer_id left join erp_branches b on b.id = cu.branch_id
    where st.company_id = p_company and st.due and p.status in ('published','in_progress','done') and p.plan_date between p_from and p_to
    group by p.route_id, p.rep_id, b.area),
  routes as (select route_id, rep_id, sum(planned) planned, sum(visited) visited from s where route_id is not null group by route_id, rep_id having sum(planned) >= 3),
  reps as (select rep_id, sum(planned) planned, sum(visited) visited from s where rep_id is not null group by rep_id having sum(planned) >= 5),
  areas as (select area, sum(planned) planned, sum(visited) visited from s where area is not null group by area having sum(planned) >= 10)
  select
    (select count(*) from (select erp_fe_alert_raise('coverage','coverage_route_below','route:'||route_id,
        'Route coverage '||round(100.0*visited/planned)||'% below target '||round(v_target)||'%',
        (case when 100.0*visited/planned < v_target-15 then 'critical' else 'warning' end),'route',
        jsonb_build_object('coverage_pct',round(100.0*visited/planned),'target',round(v_target),'planned',planned,'visited',visited),
        round(100.0*visited/planned), null,null,null, route_id, rep_id, null,null,
        erp_fe_responsible_manager(rep_id), current_date + (case when 100.0*visited/planned < v_target-15 then 1 else 3 end), p_company, 'supervisor')
      from routes where 100.0*visited/planned < v_target) z)
  + (select count(*) from (select erp_fe_alert_raise('coverage','coverage_rep_below','rep:'||rep_id,
        'Rep coverage '||round(100.0*visited/planned)||'% below target '||round(v_target)||'%',
        (case when 100.0*visited/planned < v_target-15 then 'critical' else 'warning' end),'rep',
        jsonb_build_object('coverage_pct',round(100.0*visited/planned),'target',round(v_target),'planned',planned,'visited',visited),
        round(100.0*visited/planned), null,null,null, null, rep_id, null,null,
        erp_fe_responsible_manager(rep_id), current_date + (case when 100.0*visited/planned < v_target-15 then 1 else 3 end), p_company, 'supervisor')
      from reps where 100.0*visited/planned < v_target) z)
  + (select count(*) from (select erp_fe_alert_raise('coverage','coverage_area_below','area:'||area,
        'Area '||area||' coverage '||round(100.0*visited/planned)||'% below target '||round(v_target)||'%',
        (case when 100.0*visited/planned < v_target-15 then 'critical' else 'warning' end),'area',
        jsonb_build_object('coverage_pct',round(100.0*visited/planned),'target',round(v_target),'planned',planned,'visited',visited),
        round(100.0*visited/planned), null, area, null, null, null, null,null,
        null, current_date + 3, p_company, 'area_manager')   -- area alert: owner assigned later (area manager)
      from areas where 100.0*visited/planned < v_target) z)
  into m;
  return coalesce(m, 0);
end; $$;

-- 2) COMPLIANCE — excessive out-of-geofence visits per rep; repeated violations at the same customer.
create or replace function erp_fe_rule_compliance(p_company uuid, p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_th numeric := erp_fe_threshold('geofence_violation_count', p_company); m int;
begin
  with v as (select rep_id, customer_id from erp_fe_visits
      where company_id = p_company and geofence_status = 'violation' and checkin_at::date between p_from and p_to),
  per_rep as (select rep_id, count(*) c from v where rep_id is not null group by rep_id having count(*) >= v_th),
  per_cust as (select rep_id, customer_id, count(*) c from v where rep_id is not null and customer_id is not null group by rep_id, customer_id having count(*) >= 2)
  select
    (select count(*) from (select erp_fe_alert_raise('compliance','compliance_geofence_excess','rep:'||rep_id,
        c||' out-of-geofence visits',(case when c >= v_th*2 then 'critical' else 'warning' end),'rep',
        jsonb_build_object('violations',c,'threshold',round(v_th)), c, null,null,null,null, rep_id, null,null,
        erp_fe_responsible_manager(rep_id), current_date + (case when c >= v_th*2 then 1 else 3 end), p_company, 'supervisor')
      from per_rep) z)
  + (select count(*) from (select erp_fe_alert_raise('compliance','compliance_repeat_violation','rep:'||rep_id||':cust:'||customer_id,
        'Repeated geofence violations ('||c||') at the same customer','warning','customer',
        jsonb_build_object('violations',c), c, null,null,null,null, rep_id, customer_id, null,
        erp_fe_responsible_manager(rep_id), current_date + 3, p_company, 'supervisor')
      from per_cust) z)
  into m;
  return coalesce(m, 0);
end; $$;

-- 3) OOS — high-OOS customers; repeated OOS on the same SKU; route-level OOS trend.
create or replace function erp_fe_rule_oos(p_company uuid, p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_rep numeric := erp_fe_threshold('oos_repeat_count', p_company); m int;
begin
  with o as (select c.customer_id, c.created_by rep, v.route_id, nullif(s.values->>'product','') sku,
        coalesce((nullif(s.values->>'est_lost_sales',''))::numeric,0) lost
      from erp_fe_captures c join erp_form_submissions s on s.id = c.submission_id left join erp_fe_visits v on v.id = c.visit_id
      where c.company_id = p_company and c.kind = 'out_of_stock' and c.created_at::date between p_from and p_to),
  high_cust as (select customer_id, rep, count(*) c, sum(lost) lost from o where customer_id is not null group by customer_id, rep having count(*) >= v_rep),
  repeat_sku as (select customer_id, rep, sku, count(*) c from o where customer_id is not null and sku is not null group by customer_id, rep, sku having count(*) >= 2),
  route_trend as (select route_id, count(*) c, count(distinct customer_id) custs from o where route_id is not null group by route_id having count(*) >= v_rep*2)
  select
    (select count(*) from (select erp_fe_alert_raise('oos','oos_high_customer','cust:'||customer_id,
        'High out-of-stock customer ('||c||' items)',(case when c >= v_rep*2 then 'critical' else 'warning' end),'customer',
        jsonb_build_object('oos_count',c,'est_lost_sales',lost,'threshold',round(v_rep)), c, null,null,null,null, rep, customer_id, null,
        erp_fe_responsible_manager(rep), current_date + (case when c >= v_rep*2 then 1 else 3 end), p_company, 'supervisor')
      from high_cust) z)
  + (select count(*) from (select erp_fe_alert_raise('oos','oos_repeat_sku','cust:'||customer_id||':sku:'||sku,
        'Repeated out-of-stock on SKU '||sku||' ('||c||'×)','warning','sku',
        jsonb_build_object('oos_count',c,'sku',sku), c, null,null,null,null, rep, customer_id, sku,
        erp_fe_responsible_manager(rep), current_date + 3, p_company, 'supervisor')
      from repeat_sku) z)
  + (select count(*) from (select erp_fe_alert_raise('oos','oos_route_trend','route:'||route_id,
        'Route OOS trend: '||c||' items across '||custs||' customers','warning','route',
        jsonb_build_object('oos_count',c,'customers',custs), c, null,null,null, route_id,
        (select rep_id from erp_routes where id = route_id), null,null,
        erp_fe_responsible_manager((select rep_id from erp_routes where id = route_id)), current_date + 3, p_company, 'supervisor')
      from route_trend) z)
  into m;
  return coalesce(m, 0);
end; $$;

-- 4) OPPORTUNITY — new; high-value; unfollowed (no return visit after N days).
create or replace function erp_fe_rule_opportunity(p_company uuid, p_from date, p_to date)
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_high numeric := erp_fe_threshold('opportunity_value_high', p_company); v_days numeric := erp_fe_threshold('opp_unfollowed_days', p_company); m int;
begin
  with o as (select c.id cap, c.customer_id, c.created_by rep, v.route_id, c.created_at,
        coalesce((nullif(s.values->>'est_value',''))::numeric,0) val
      from erp_fe_captures c join erp_form_submissions s on s.id = c.submission_id left join erp_fe_visits v on v.id = c.visit_id
      where c.company_id = p_company and c.kind = 'opportunity')
  select
    (select count(*) from (select erp_fe_alert_raise('opportunity','opp_new','cap:'||cap,
        'New opportunity'||(case when val>0 then ' ('||val||')' else '' end),'info','customer',
        jsonb_build_object('est_value',val), val, null,null,null, route_id, rep, customer_id, null,
        erp_fe_responsible_manager(rep), current_date + 7, p_company, 'supervisor')
      from o where created_at::date between p_from and p_to and val < v_high) z)
  + (select count(*) from (select erp_fe_alert_raise('opportunity','opp_high_value','cap:'||cap,
        'High-value opportunity ('||val||')',(case when val >= v_high*2 then 'critical' else 'warning' end),'customer',
        jsonb_build_object('est_value',val,'threshold',round(v_high)), val, null,null,null, route_id, rep, customer_id, null,
        erp_fe_responsible_manager(rep), current_date + (case when val >= v_high*2 then 1 else 3 end), p_company, 'supervisor')
      from o where created_at::date between p_from and p_to and val >= v_high) z)
  + (select count(*) from (select erp_fe_alert_raise('opportunity','opp_unfollowed','cap:'||cap,
        'Unfollowed opportunity ('||(current_date - created_at::date)||' days)','warning','customer',
        jsonb_build_object('est_value',val,'age_days',current_date - created_at::date), val, null,null,null, route_id, rep, customer_id, null,
        erp_fe_responsible_manager(rep), current_date + 3, p_company, 'supervisor')
      from o where created_at::date < current_date - v_days::int
        and not exists (select 1 from erp_fe_visits v2 where v2.customer_id = o.customer_id and v2.checkin_at > o.created_at)) z)
  into m;
  return coalesce(m, 0);
end; $$;

-- 5) CUSTOMER RISK — repeated missed visits; declining execution score; declining coverage.
create or replace function erp_fe_rule_customer_risk(p_company uuid, p_from date, p_to date, p_prev_from date, p_prev_to date)
returns integer language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_miss numeric := erp_fe_threshold('missed_visit_count', p_company); v_sdrop numeric := erp_fe_threshold('declining_score_drop', p_company);
  v_cdrop numeric := erp_fe_threshold('declining_coverage_drop', p_company); m int := 0; r record; v_cur numeric; v_prev numeric;
begin
  -- repeated missed visits
  with miss as (select st.customer_id, count(*) c from erp_fe_route_stops st join erp_fe_route_plans p on p.id = st.plan_id
      where st.company_id = p_company and st.due and (st.status='missed' or (st.status<>'visited' and p.plan_date < current_date)) and p.plan_date between p_from and p_to
      group by st.customer_id having count(*) >= v_miss)
  select count(*) from (select erp_fe_alert_raise('customer_risk','risk_missed_visits','cust:'||customer_id,
      'Repeated missed visits ('||c||')',(case when c >= v_miss*2 then 'critical' else 'warning' end),'customer',
      jsonb_build_object('missed',c,'threshold',round(v_miss)), c, null,null,null,
      (select route_id from erp_customers where id = miss.customer_id), (select salesman_id from erp_customers where id = miss.customer_id), customer_id, null,
      erp_fe_responsible_manager((select salesman_id from erp_customers where id = miss.customer_id)), current_date + 3, p_company, 'supervisor')
    from miss) z into m;

  -- declining execution score (customers active this window; compare with previous equal window)
  for r in select distinct c.customer_id cid, c.created_by rep, v.route_id from erp_fe_captures c left join erp_fe_visits v on v.id = c.visit_id
      where c.company_id = p_company and c.created_at::date between p_from and p_to and c.customer_id is not null loop
    v_cur := (erp_fe_execution_scores('customer', r.cid, p_from::timestamptz, (p_to + 1)::timestamptz)->>'overall')::numeric;
    v_prev := (erp_fe_execution_scores('customer', r.cid, p_prev_from::timestamptz, (p_prev_to + 1)::timestamptz)->>'overall')::numeric;
    if v_cur is not null and v_prev is not null and v_prev - v_cur >= v_sdrop then
      perform erp_fe_alert_raise('customer_risk','risk_declining_score','cust:'||r.cid,
        'Declining execution score ('||round(v_prev)||' → '||round(v_cur)||')',
        (case when v_prev - v_cur >= v_sdrop*2 then 'critical' else 'warning' end),'customer',
        jsonb_build_object('prev',round(v_prev),'current',round(v_cur),'drop',round(v_prev - v_cur)), round(v_cur),
        null,null,null, r.route_id, r.rep, r.cid, null,
        erp_fe_responsible_manager(r.rep), current_date + 3, p_company, 'supervisor');
      m := m + 1;
    end if;
  end loop;

  -- declining coverage (visited% this window vs previous, per customer)
  with cov as (select st.customer_id,
      count(*) filter (where p.plan_date between p_from and p_to) pl_c, count(*) filter (where p.plan_date between p_from and p_to and st.status='visited') vs_c,
      count(*) filter (where p.plan_date between p_prev_from and p_prev_to) pl_p, count(*) filter (where p.plan_date between p_prev_from and p_prev_to and st.status='visited') vs_p
    from erp_fe_route_stops st join erp_fe_route_plans p on p.id = st.plan_id
    where st.company_id = p_company and st.due and p.plan_date between p_prev_from and p_to group by st.customer_id),
  drop_c as (select customer_id, round(100.0*vs_c/pl_c) cur, round(100.0*vs_p/pl_p) prev from cov where pl_c > 0 and pl_p > 0)
  select m + count(*) from (select erp_fe_alert_raise('customer_risk','risk_declining_coverage','cust:'||customer_id,
      'Declining coverage ('||prev||'% → '||cur||'%)','warning','customer',
      jsonb_build_object('prev',prev,'current',cur,'drop',prev - cur), cur, null,null,null,
      (select route_id from erp_customers where id = drop_c.customer_id), (select salesman_id from erp_customers where id = drop_c.customer_id), customer_id, null,
      erp_fe_responsible_manager((select salesman_id from erp_customers where id = drop_c.customer_id)), current_date + 3, p_company, 'supervisor')
    from drop_c where prev - cur >= v_cdrop) z into m;
  return coalesce(m, 0);
end; $$;

-- ── Orchestrator (admin / owner only; runs the company's rules, lazy/manual) ─
create or replace function erp_fe_run_alert_rules(p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_to date := coalesce(p_to, current_date); v_from date := coalesce(p_from, current_date - 13);
  v_len int; v_prev_to date; v_prev_from date; v_cov int; v_comp int; v_oos int; v_opp int; v_risk int;
begin
  if v_company is null then raise exception 'forbidden'; end if;
  if not erp_fe_sees_all() then raise exception 'forbidden'; end if;   -- company-wide write: admin/owner only
  v_len := (v_to - v_from) + 1; v_prev_to := v_from - 1; v_prev_from := v_prev_to - (v_len - 1);
  v_cov  := erp_fe_rule_coverage(v_company, v_from, v_to);
  v_comp := erp_fe_rule_compliance(v_company, v_from, v_to);
  v_oos  := erp_fe_rule_oos(v_company, v_from, v_to);
  v_opp  := erp_fe_rule_opportunity(v_company, v_from, v_to);
  v_risk := erp_fe_rule_customer_risk(v_company, v_from, v_to, v_prev_from, v_prev_to);
  return jsonb_build_object('from', v_from, 'to', v_to, 'coverage', v_cov, 'compliance', v_comp, 'oos', v_oos,
    'opportunity', v_opp, 'customer_risk', v_risk, 'total', v_cov + v_comp + v_oos + v_opp + v_risk);
end; $$;
revoke all on function erp_fe_run_alert_rules(date, date) from public, anon; grant execute on function erp_fe_run_alert_rules(date, date) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop erp_fe_run_alert_rules + the erp_fe_rule_* functions
-- + erp_fe_threshold / erp_fe_responsible_manager; restore the 18-arg
-- erp_fe_alert_raise; drop erp_fe_alert_thresholds; drop the added alert columns.
-- ============================================================================
