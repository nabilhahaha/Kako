-- ============================================================================
-- 0136: Field Execution (FE-5e-1) — actionable alert spine + ownership lifecycle
-- ----------------------------------------------------------------------------
-- Alerts are MANAGEMENT ACTIONS, not just notifications. Every alert carries an
-- owner, a status lifecycle, a created + due date and a resolution note, a
-- severity (info/warning/critical) and the scope dimensions it concerns
-- (region/area/branch/route/rep/customer/sku). Reads are scope-aware: a manager
-- only sees alerts within their reporting subtree (erp_fe_team) — URL tampering
-- can't reach another manager's alerts. Admins/owners see all.
--
-- `category` and `rule_key` are intentionally open text (no enum) so the future
-- Commercial pack (target achievement / growth decline / commission exceptions /
-- trade-spend ROI) plugs in new rules with NO schema change.
--
-- Idempotent: at most one NON-terminal alert per (company, rule_key, dedupe_key);
-- re-running a rule refreshes the existing open alert instead of duplicating it.
-- Once resolved/dismissed it leaves the partial index, so a genuine recurrence
-- opens a fresh actionable alert.
-- ============================================================================

create table if not exists erp_fe_alerts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references erp_companies(id) on delete cascade,
  -- classification
  category      text not null,                       -- coverage|compliance|oos|opportunity|customer_risk|commercial(future)
  rule_key      text not null,                       -- specific rule, e.g. coverage_route_below
  severity      text not null default 'warning' check (severity in ('info','warning','critical')),
  -- subject (scope dimensions the alert is about)
  scope_level   text check (scope_level in ('company','region','area','branch','route','rep','customer','sku')),
  region        text,
  area          text,
  branch_id     uuid references erp_branches(id) on delete set null,
  route_id      uuid references erp_routes(id) on delete set null,
  rep_id        uuid references erp_profiles(id) on delete set null,   -- the responsible rep (drives scope)
  customer_id   uuid references erp_customers(id) on delete set null,
  sku           text,
  -- content + metrics
  title         text not null,
  details       jsonb not null default '{}'::jsonb,  -- metric/target/value/count/window…
  metric        numeric,                              -- primary number (e.g. coverage %)
  -- ownership lifecycle (the actionability spine)
  owner_id      uuid references erp_profiles(id) on delete set null,
  status        text not null default 'open' check (status in ('open','acknowledged','in_progress','resolved','dismissed')),
  due_date      date,
  resolution_note text,
  resolved_at   timestamptz,
  resolved_by   uuid references erp_profiles(id) on delete set null,
  -- idempotency
  dedupe_key    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid
);
-- one open (non-terminal) alert per rule+subject
create unique index if not exists uq_fe_alerts_open on erp_fe_alerts(company_id, rule_key, dedupe_key)
  where status in ('open','acknowledged','in_progress');
create index if not exists idx_fe_alerts_company_status on erp_fe_alerts(company_id, status, severity);
create index if not exists idx_fe_alerts_rep on erp_fe_alerts(company_id, rep_id);
create index if not exists idx_fe_alerts_owner on erp_fe_alerts(company_id, owner_id);
create index if not exists idx_fe_alerts_category on erp_fe_alerts(company_id, category, created_at desc);

alter table erp_fe_alerts enable row level security;
-- READ is scope-aware: platform owner, or in-company AND (sees-all OR owns it OR
-- the responsible rep is in my team). So managers see only their scope.
drop policy if exists erp_fe_alerts_read on erp_fe_alerts;
create policy erp_fe_alerts_read on erp_fe_alerts for select using (
  (select erp_is_platform_owner())
  or (company_id = (select erp_user_company_id()) and (
    (select erp_fe_sees_all()) or owner_id = (select auth.uid()) or rep_id in (select erp_fe_team()))));
-- Direct writes only for admins/owners; managers act through the scoped RPCs
-- below (security-definer) which enforce team scope.
drop policy if exists erp_fe_alerts_write on erp_fe_alerts;
create policy erp_fe_alerts_write on erp_fe_alerts for all using (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))
) with check (
  (select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));

drop trigger if exists trg_audit_erp_fe_alerts on erp_fe_alerts;
create trigger trg_audit_erp_fe_alerts after insert or update or delete on erp_fe_alerts for each row execute function erp_audit_capture();
drop trigger if exists erp_fe_alerts_updated on erp_fe_alerts;
create trigger erp_fe_alerts_updated before update on erp_fe_alerts for each row execute function erp_set_updated_at();

-- ── Raise / refresh an alert (idempotent on rule_key + dedupe_key) ──────────
-- Used by the FE-5e-2 detection rules and any future rule with no code change.
create or replace function erp_fe_alert_raise(
  p_category text, p_rule_key text, p_dedupe text, p_title text,
  p_severity text default 'warning', p_scope_level text default null, p_details jsonb default '{}'::jsonb,
  p_metric numeric default null, p_region text default null, p_area text default null, p_branch uuid default null,
  p_route uuid default null, p_rep uuid default null, p_customer uuid default null, p_sku text default null,
  p_owner uuid default null, p_due date default null, p_company uuid default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := coalesce(p_company, erp_user_company_id()); v_id uuid;
begin
  if v_company is null then raise exception 'no company'; end if;
  insert into erp_fe_alerts (company_id, category, rule_key, severity, scope_level, region, area, branch_id, route_id, rep_id, customer_id, sku,
    title, details, metric, owner_id, due_date, dedupe_key, created_by)
  values (v_company, p_category, p_rule_key, coalesce(p_severity,'warning'), p_scope_level, p_region, p_area, p_branch, p_route, p_rep, p_customer, p_sku,
    p_title, coalesce(p_details,'{}'::jsonb), p_metric, p_owner, p_due, p_dedupe, (select auth.uid()))
  on conflict (company_id, rule_key, dedupe_key) where status in ('open','acknowledged','in_progress')
  do update set severity = excluded.severity, title = excluded.title, details = excluded.details, metric = excluded.metric,
    region = excluded.region, area = excluded.area, branch_id = excluded.branch_id, route_id = excluded.route_id,
    rep_id = excluded.rep_id, customer_id = excluded.customer_id, sku = excluded.sku,
    owner_id = coalesce(erp_fe_alerts.owner_id, excluded.owner_id),   -- keep an assigned owner
    due_date = coalesce(erp_fe_alerts.due_date, excluded.due_date), updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function erp_fe_alert_raise(text,text,text,text,text,text,jsonb,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,date,uuid) from public, anon;
grant execute on function erp_fe_alert_raise(text,text,text,text,text,text,jsonb,numeric,text,text,uuid,uuid,uuid,uuid,text,uuid,date,uuid) to authenticated;

-- ── Scope guard for a single alert (sees-all / owner / responsible rep in team) ─
create or replace function erp_fe_alert_in_scope(p_alert uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp' as $$
  select exists(
    select 1 from erp_fe_alerts a where a.id = p_alert and a.company_id = (select erp_user_company_id())
      and ((select erp_fe_sees_all()) or a.owner_id = (select auth.uid()) or a.rep_id in (select erp_fe_team())));
$$;
revoke all on function erp_fe_alert_in_scope(uuid) from public, anon; grant execute on function erp_fe_alert_in_scope(uuid) to authenticated;

-- ── Scoped list (Effective = Scope AND Filters) ────────────────────────────
create or replace function erp_fe_alerts_list(p_status text[] default null, p_category text default null, p_severity text default null, p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return '[]'::jsonb; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(j order by sev_rank, created_at desc), '[]'::jsonb) into v from (
    select a.created_at, (case a.severity when 'critical' then 0 when 'warning' then 1 else 2 end) sev_rank,
      jsonb_build_object('id', a.id, 'category', a.category, 'rule_key', a.rule_key, 'severity', a.severity, 'scope_level', a.scope_level,
        'title', a.title, 'details', a.details, 'metric', a.metric, 'status', a.status, 'due_date', a.due_date,
        'owner_id', a.owner_id, 'owner', op.full_name, 'resolution_note', a.resolution_note, 'resolved_at', a.resolved_at,
        'region', a.region, 'area', a.area, 'route_id', a.route_id, 'rep_id', a.rep_id, 'rep', rp.full_name,
        'customer_id', a.customer_id, 'customer', cu.name, 'sku', a.sku, 'created_at', a.created_at) j
    from erp_fe_alerts a
    left join erp_profiles op on op.id = a.owner_id
    left join erp_profiles rp on rp.id = a.rep_id
    left join erp_customers cu on cu.id = a.customer_id
    where a.company_id = v_company
      and (v_all or a.owner_id = (select auth.uid()) or a.rep_id = any(v_team))   -- scope
      and (p_status is null or a.status = any(p_status))                          -- filters (AND)
      and (p_category is null or a.category = p_category)
      and (p_severity is null or a.severity = p_severity)
    order by sev_rank, a.created_at desc limit greatest(1, least(coalesce(p_limit,100), 500))) s;
  return v;
end; $$;
revoke all on function erp_fe_alerts_list(text[], text, text, integer) from public, anon; grant execute on function erp_fe_alerts_list(text[], text, text, integer) to authenticated;

-- ── Scoped open-alert summary (counts by severity + category) for badges ───
create or replace function erp_fe_alerts_summary()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb; v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then return null; end if;
  if not (v_all or (select erp_matrix_has('field_ops','view')) or (select erp_matrix_has('field_ops','dashboard'))) then raise exception 'forbidden'; end if;
  with a as (select * from erp_fe_alerts where company_id = v_company and status in ('open','acknowledged','in_progress')
      and (v_all or owner_id = (select auth.uid()) or rep_id = any(v_team)))
  select jsonb_build_object('open', count(*), 'critical', count(*) filter (where severity='critical'),
    'warning', count(*) filter (where severity='warning'), 'info', count(*) filter (where severity='info'),
    'unowned', count(*) filter (where owner_id is null), 'overdue', count(*) filter (where due_date is not null and due_date < current_date),
    'by_category', coalesce((select jsonb_object_agg(category, c) from (select category, count(*) c from a group by category) g), '{}'::jsonb)) into v from a;
  return v;
end; $$;
revoke all on function erp_fe_alerts_summary() from public, anon; grant execute on function erp_fe_alerts_summary() to authenticated;

-- ── Lifecycle: assign owner (scope-checked) ────────────────────────────────
create or replace function erp_fe_alert_assign(p_alert uuid, p_owner uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_all boolean := erp_fe_sees_all(); v_team uuid[] := array(select erp_fe_team());
begin
  if v_company is null then raise exception 'forbidden'; end if;
  if not erp_fe_alert_in_scope(p_alert) then raise exception 'forbidden'; end if;        -- can't touch out-of-scope alerts
  if p_owner is not null and not (v_all or p_owner = (select auth.uid()) or p_owner = any(v_team)) then
    raise exception 'owner out of scope'; end if;                                        -- can only assign within scope
  update erp_fe_alerts set owner_id = p_owner, status = case when status='open' then 'acknowledged' else status end, updated_at = now()
    where id = p_alert and company_id = v_company;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function erp_fe_alert_assign(uuid, uuid) from public, anon; grant execute on function erp_fe_alert_assign(uuid, uuid) to authenticated;

-- ── Lifecycle: change status (+ resolution note / due date), scope-checked ─
create or replace function erp_fe_alert_set_status(p_alert uuid, p_status text, p_note text default null, p_due date default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id();
begin
  if v_company is null then raise exception 'forbidden'; end if;
  if p_status not in ('open','acknowledged','in_progress','resolved','dismissed') then raise exception 'bad status'; end if;
  if not erp_fe_alert_in_scope(p_alert) then raise exception 'forbidden'; end if;
  update erp_fe_alerts set status = p_status,
    resolution_note = coalesce(p_note, resolution_note),
    due_date = coalesce(p_due, due_date),
    resolved_at = case when p_status in ('resolved','dismissed') then now() else null end,
    resolved_by = case when p_status in ('resolved','dismissed') then (select auth.uid()) else null end,
    updated_at = now()
    where id = p_alert and company_id = v_company;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function erp_fe_alert_set_status(uuid, text, text, date) from public, anon; grant execute on function erp_fe_alert_set_status(uuid, text, text, date) to authenticated;

-- ============================================================================
-- ROLLBACK (manual): drop the lifecycle RPCs + erp_fe_alert_raise +
-- erp_fe_alerts_list / _summary / _in_scope; drop table erp_fe_alerts.
-- ============================================================================
