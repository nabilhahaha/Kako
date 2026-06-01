-- ============================================================================
-- 0152: Scheduler wiring (PR-2) — jobs registry, runs log, health, staleness
-- ----------------------------------------------------------------------------
-- Turns the lazy/manual orchestrators (alert detection, …) into scheduled jobs
-- with full observability: last/next run, last status, duration, last error,
-- enable/disable, manual re-run, per-execution audit (erp_sched_runs), and a
-- staleness check that raises a real alert when a CRITICAL job hasn't succeeded
-- within its expected interval. pg_cron wiring is guarded by an extension check
-- so the local/test chain (no pg_cron) stays green; real Supabase gets the cron.
--
-- The dispatcher runs JWT-scoped company logic by briefly impersonating a
-- company admin (request.jwt.claim.sub GUC), so the existing security-definer
-- functions resolve company + sees_all exactly as in an interactive admin session.
-- ============================================================================

create table if not exists erp_sched_jobs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  key         text not null,                       -- action key (e.g. fe_alert_detection)
  label       text not null,
  interval_minutes integer not null default 60,
  expected_minutes integer,                         -- staleness window for critical jobs
  critical    boolean not null default false,
  enabled     boolean not null default true,
  last_run_at timestamptz, next_run_at timestamptz, last_status text, last_duration_ms integer, last_error text, last_run_id uuid,
  created_at  timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (company_id, key)
);
create table if not exists erp_sched_runs (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references erp_sched_jobs(id) on delete cascade,
  company_id  uuid not null references erp_companies(id) on delete cascade,
  started_at  timestamptz not null default now(), finished_at timestamptz,
  status      text not null default 'running' check (status in ('running','ok','failed')),
  duration_ms integer, error text, result jsonb, triggered_by text not null default 'manual', actor uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sched_runs_job on erp_sched_runs(job_id, started_at desc);
create index if not exists idx_sched_jobs_due on erp_sched_jobs(enabled, next_run_at);

alter table erp_sched_jobs enable row level security;
alter table erp_sched_runs enable row level security;
drop policy if exists erp_sched_jobs_rw on erp_sched_jobs;
create policy erp_sched_jobs_rw on erp_sched_jobs for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_sched_runs_read on erp_sched_runs;
create policy erp_sched_runs_read on erp_sched_runs for select using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop policy if exists erp_sched_runs_write on erp_sched_runs;
create policy erp_sched_runs_write on erp_sched_runs for all using ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id))) with check ((select erp_is_platform_owner()) or (select erp_is_company_admin(company_id)));
drop trigger if exists trg_audit_erp_sched_jobs on erp_sched_jobs;
create trigger trg_audit_erp_sched_jobs after insert or update or delete on erp_sched_jobs for each row execute function erp_audit_capture();
drop trigger if exists erp_sched_jobs_updated on erp_sched_jobs;
create trigger erp_sched_jobs_updated before update on erp_sched_jobs for each row execute function erp_set_updated_at();

-- ── Register / ensure default jobs (admin) ─────────────────────────────────
create or replace function erp_sched_register(p_key text, p_label text, p_interval_minutes integer, p_expected_minutes integer default null, p_critical boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v_id uuid;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  insert into erp_sched_jobs (company_id, key, label, interval_minutes, expected_minutes, critical, next_run_at)
    values (v_company, p_key, p_label, greatest(1,p_interval_minutes), p_expected_minutes, coalesce(p_critical,false), now() + (greatest(1,p_interval_minutes)||' minutes')::interval)
  on conflict (company_id, key) do update set label=excluded.label, interval_minutes=excluded.interval_minutes, expected_minutes=excluded.expected_minutes, critical=excluded.critical, updated_at=now()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_sched_register(text,text,integer,integer,boolean) from public, anon; grant execute on function erp_sched_register(text,text,integer,integer,boolean) to authenticated;

create or replace function erp_sched_ensure_defaults()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  perform erp_sched_register('fe_alert_detection', 'Field alert detection', 60, 180, true);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function erp_sched_ensure_defaults() from public, anon; grant execute on function erp_sched_ensure_defaults() to authenticated;

create or replace function erp_sched_set_enabled(p_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id();
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  update erp_sched_jobs set enabled=p_enabled, updated_at=now() where id=p_id and company_id=v_company;
  if not found then raise exception 'not found'; end if;
  return jsonb_build_object('ok', true, 'enabled', p_enabled);
end; $$;
revoke all on function erp_sched_set_enabled(uuid, boolean) from public, anon; grant execute on function erp_sched_set_enabled(uuid, boolean) to authenticated;

-- ── Dispatcher: run one job (records a run; impersonates a company admin) ───
create or replace function erp_sched_run_job(p_job_id uuid, p_triggered_by text default 'manual')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare j erp_sched_jobs; v_admin uuid; v_run uuid; v_start timestamptz := clock_timestamp(); v_ok boolean := true; v_err text; v_prev text; v_uid uuid := (select auth.uid()); v_ms int;
begin
  select * into j from erp_sched_jobs where id=p_job_id; if not found then raise exception 'not found'; end if;
  -- callable by the cron/service context (no JWT) or a company admin / platform owner
  if v_uid is not null and not ((select erp_is_platform_owner()) or (select erp_is_company_admin(j.company_id))) then raise exception 'forbidden'; end if;
  insert into erp_sched_runs (job_id, company_id, started_at, status, triggered_by, actor) values (p_job_id, j.company_id, v_start, 'running', coalesce(p_triggered_by,'manual'), v_uid) returning id into v_run;
  select ub.user_id into v_admin from erp_user_branches ub join erp_branches b on b.id=ub.branch_id where b.company_id=j.company_id and ub.role='admin' order by ub.is_default desc nulls last limit 1;
  v_prev := current_setting('request.jwt.claim.sub', true);
  begin
    if v_admin is not null then perform set_config('request.jwt.claim.sub', v_admin::text, true); end if;
    if j.key = 'fe_alert_detection' then perform erp_fe_run_alert_rules();
    else raise exception 'unknown job key: %', j.key; end if;
  exception when others then v_ok := false; v_err := SQLERRM;
  end;
  perform set_config('request.jwt.claim.sub', coalesce(v_prev,''), true);   -- restore caller context
  v_ms := (extract(epoch from (clock_timestamp()-v_start))*1000)::int;
  update erp_sched_runs set finished_at=clock_timestamp(), status=case when v_ok then 'ok' else 'failed' end, duration_ms=v_ms, error=v_err where id=v_run;
  update erp_sched_jobs set last_run_at=now(), last_status=case when v_ok then 'ok' else 'failed' end, last_duration_ms=v_ms, last_error=v_err, last_run_id=v_run,
    next_run_at = now() + (interval_minutes||' minutes')::interval where id=p_job_id;
  return jsonb_build_object('ok', v_ok, 'run_id', v_run, 'duration_ms', v_ms, 'error', v_err);
end; $$;
revoke all on function erp_sched_run_job(uuid, text) from public, anon; grant execute on function erp_sched_run_job(uuid, text) to authenticated;

-- ── Tick: run all due enabled jobs (cron/service or platform owner) ────────
create or replace function erp_sched_tick()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare r record; n int := 0; v_uid uuid := (select auth.uid());
begin
  if v_uid is not null and not (select erp_is_platform_owner()) then raise exception 'forbidden'; end if;
  for r in select id from erp_sched_jobs where enabled and (next_run_at is null or next_run_at <= now()) loop
    perform erp_sched_run_job(r.id, 'schedule'); n := n + 1;
  end loop;
  return jsonb_build_object('ran', n);
end; $$;
revoke all on function erp_sched_tick() from public, anon; grant execute on function erp_sched_tick() to authenticated;

-- ── Staleness: raise a critical alert for jobs that haven't succeeded in time ─
create or replace function erp_sched_check_stale()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare j erp_sched_jobs; n int := 0; v_uid uuid := (select auth.uid());
begin
  if v_uid is not null and not (select erp_is_platform_owner()) then raise exception 'forbidden'; end if;
  for j in select * from erp_sched_jobs where enabled and critical loop
    if j.last_status is distinct from 'ok' or j.last_run_at is null
       or (j.expected_minutes is not null and j.last_run_at < now() - (j.expected_minutes||' minutes')::interval) then
      perform erp_fe_alert_raise(p_category=>'system', p_rule_key=>'scheduler_stale', p_dedupe=>'sched:'||j.key,
        p_title=>'Scheduled job "'||j.label||'" has not run successfully', p_severity=>'critical', p_scope_level=>'company',
        p_details=>jsonb_build_object('job', j.key, 'last_status', j.last_status, 'last_run_at', j.last_run_at, 'expected_minutes', j.expected_minutes),
        p_company=>j.company_id);
      n := n + 1;
    end if;
  end loop;
  return jsonb_build_object('stale', n);
end; $$;
revoke all on function erp_sched_check_stale() from public, anon; grant execute on function erp_sched_check_stale() to authenticated;

-- ── Health dashboard data ──────────────────────────────────────────────────
create or replace function erp_sched_jobs_list()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'key', key, 'label', label, 'enabled', enabled, 'critical', critical,
    'interval_minutes', interval_minutes, 'expected_minutes', expected_minutes, 'last_run_at', last_run_at, 'next_run_at', next_run_at,
    'last_status', last_status, 'last_duration_ms', last_duration_ms, 'last_error', last_error,
    'stale', (critical and enabled and (last_status is distinct from 'ok' or last_run_at is null
      or (expected_minutes is not null and last_run_at < now() - (expected_minutes||' minutes')::interval)))) order by label), '[]'::jsonb) into v
  from erp_sched_jobs where company_id=v_company;
  return v;
end; $$;
revoke all on function erp_sched_jobs_list() from public, anon; grant execute on function erp_sched_jobs_list() to authenticated;

create or replace function erp_sched_runs_list(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := erp_user_company_id(); v jsonb;
begin
  if v_company is null or not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'started_at', started_at, 'finished_at', finished_at, 'status', status,
    'duration_ms', duration_ms, 'error', error, 'triggered_by', triggered_by) order by started_at desc), '[]'::jsonb) into v
  from (select * from erp_sched_runs where job_id=p_job and company_id=v_company order by started_at desc limit 20) z;
  return v;
end; $$;
revoke all on function erp_sched_runs_list(uuid) from public, anon; grant execute on function erp_sched_runs_list(uuid) to authenticated;

-- ── pg_cron wiring (guarded; real Supabase only) ───────────────────────────
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule('erp-sched-tick') where exists (select 1 from cron.job where jobname='erp-sched-tick');
    perform cron.unschedule('erp-sched-stale') where exists (select 1 from cron.job where jobname='erp-sched-stale');
    perform cron.schedule('erp-sched-tick', '*/15 * * * *', 'select erp_sched_tick()');
    perform cron.schedule('erp-sched-stale', '*/30 * * * *', 'select erp_sched_check_stale()');
  end if;
exception when others then null;  -- never block the migration on cron wiring
end $$;

-- ============================================================================
-- ROLLBACK (manual): cron.unschedule the two jobs; drop erp_sched_* functions;
-- drop tables erp_sched_runs, erp_sched_jobs.
-- ============================================================================
