-- ============================================================================
-- 0094: Data Integration Phase 2C-2 — Sync Engine (jobs + runs).
-- ----------------------------------------------------------------------------
-- Schedulable pull/push jobs on a 2C-1 connection. A Node dispatcher
-- (/api/internal/sync-tick, triggered by Vercel Cron) claims due jobs, runs the
-- adapter (REST pull/push), writes records through the import ingest path, and
-- finalises the run. Watermark/delta via `cursor`; reconciliation via
-- conflict_policy. RLS-first, additive + idempotent. REST-first; CSV/SFTP is a
-- later sub-slice. See docs/INTEGRATION.md §4–7.
-- ============================================================================

-- ── Sync jobs (one schedulable unit on a connection) ─────────────────────────
create table if not exists erp_sync_jobs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references erp_companies(id) on delete cascade,
  integration_id  uuid not null references erp_integrations(id) on delete cascade,
  entity          text not null,                                  -- registry entity key
  direction       text not null check (direction in ('in','out')),
  mode            text not null default 'delta' check (mode in ('full','delta')),
  interval_minutes integer not null default 15 check (interval_minutes >= 1),
  conflict_policy text not null default 'manual_review' check (conflict_policy in ('source_wins','vantora_wins','manual_review')),
  config          jsonb not null default '{}'::jsonb,             -- path, field_map, cursor_field, cursor_param…
  is_active       boolean not null default true,
  force_run       boolean not null default false,                 -- "run now" flag
  cursor          text,                                           -- delta watermark
  last_run_at     timestamptz,
  created_by      uuid references erp_profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz
);
create index if not exists idx_sync_jobs_company on erp_sync_jobs(company_id);
create index if not exists idx_sync_jobs_integration on erp_sync_jobs(integration_id);

-- ── Sync runs (per-execution log) ────────────────────────────────────────────
create table if not exists erp_sync_runs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references erp_companies(id) on delete cascade,
  job_id      uuid not null references erp_sync_jobs(id) on delete cascade,
  status      text not null default 'running' check (status in ('running','ok','partial','failed')),
  pulled      integer not null default 0,
  written     integer not null default 0,
  skipped     integer not null default 0,
  failed      integer not null default 0,
  cursor_before text,
  cursor_after  text,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_sync_runs_job on erp_sync_runs(job_id, started_at desc);
create index if not exists idx_sync_runs_company on erp_sync_runs(company_id, started_at desc);

-- ── RLS (read = owner/company member; writes via RPCs / dispatcher only) ─────
alter table erp_sync_jobs enable row level security;
drop policy if exists erp_sync_jobs_read on erp_sync_jobs;
create policy erp_sync_jobs_read on erp_sync_jobs for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

alter table erp_sync_runs enable row level security;
drop policy if exists erp_sync_runs_read on erp_sync_runs;
create policy erp_sync_runs_read on erp_sync_runs for select using (
  (select erp_is_platform_owner()) or company_id = (select erp_user_company_id()));

-- ── Management RPCs (authenticated; admin/owner guard) ───────────────────────
create or replace function erp_sync_job_create(
  p_integration_id uuid, p_entity text, p_direction text, p_mode text,
  p_interval_minutes integer, p_conflict_policy text, p_config jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid := (select erp_user_company_id()); v_int_company uuid; v_id uuid;
begin
  if v_company is null then raise exception 'no company'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  select company_id into v_int_company from erp_integrations where id = p_integration_id;
  if v_int_company is null or v_int_company <> v_company then raise exception 'unknown integration'; end if;
  if p_entity !~ '^[a-z_]+$' then raise exception 'invalid entity'; end if;
  if p_direction not in ('in','out') then raise exception 'invalid direction'; end if;
  if coalesce(p_mode,'delta') not in ('full','delta') then raise exception 'invalid mode'; end if;
  if coalesce(p_conflict_policy,'manual_review') not in ('source_wins','vantora_wins','manual_review') then raise exception 'invalid conflict policy'; end if;
  insert into erp_sync_jobs (company_id, integration_id, entity, direction, mode, interval_minutes, conflict_policy, config, created_by)
  values (v_company, p_integration_id, p_entity, p_direction, coalesce(p_mode,'delta'),
          greatest(coalesce(p_interval_minutes,15),1), coalesce(p_conflict_policy,'manual_review'),
          coalesce(p_config,'{}'::jsonb), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end; $$;
revoke all on function erp_sync_job_create(uuid,text,text,text,integer,text,jsonb) from public, anon;
grant execute on function erp_sync_job_create(uuid,text,text,text,integer,text,jsonb) to authenticated;

create or replace function erp_sync_job_update(
  p_id uuid, p_is_active boolean, p_interval_minutes integer, p_mode text, p_conflict_policy text, p_config jsonb)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_sync_jobs where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  if p_mode is not null and p_mode not in ('full','delta') then raise exception 'invalid mode'; end if;
  if p_conflict_policy is not null and p_conflict_policy not in ('source_wins','vantora_wins','manual_review') then raise exception 'invalid conflict policy'; end if;
  update erp_sync_jobs set
    is_active = coalesce(p_is_active, is_active),
    interval_minutes = greatest(coalesce(p_interval_minutes, interval_minutes), 1),
    mode = coalesce(p_mode, mode),
    conflict_policy = coalesce(p_conflict_policy, conflict_policy),
    config = coalesce(p_config, config)
  where id = p_id;
  return true;
end; $$;
revoke all on function erp_sync_job_update(uuid,boolean,integer,text,text,jsonb) from public, anon;
grant execute on function erp_sync_job_update(uuid,boolean,integer,text,text,jsonb) to authenticated;

create or replace function erp_sync_job_run_now(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_sync_jobs where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  update erp_sync_jobs set force_run = true where id = p_id and is_active;
  return true;
end; $$;
revoke all on function erp_sync_job_run_now(uuid) from public, anon;
grant execute on function erp_sync_job_run_now(uuid) to authenticated;

create or replace function erp_sync_job_revoke(p_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_company uuid;
begin
  select company_id into v_company from erp_sync_jobs where id = p_id;
  if v_company is null then raise exception 'not found'; end if;
  if not ((select erp_is_platform_owner()) or (select erp_is_company_admin(v_company))) then raise exception 'forbidden'; end if;
  update erp_sync_jobs set is_active=false, revoked_at=now() where id=p_id and revoked_at is null;
  return true;
end; $$;
revoke all on function erp_sync_job_revoke(uuid) from public, anon;
grant execute on function erp_sync_job_revoke(uuid) to authenticated;

-- ── Dispatcher RPCs (service_role only; called by the Node sync-tick route) ──
-- Claim due/forced jobs, stamp last_run_at, open a 'running' run, and return the
-- job + connection details incl. the decrypted Vault credential (service-role
-- only). SKIP LOCKED so overlapping ticks never double-run a job.
create or replace function erp_sync_claim_due(p_limit integer default 10)
returns table(run_id uuid, job_id uuid, company_id uuid, integration_id uuid, entity text,
              direction text, mode text, conflict_policy text, job_config jsonb, job_cursor text,
              adapter text, integration_config jsonb, secret text)
language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare j record; v_run uuid; v_secret text;
begin
  for j in
    select jb.* , i.adapter as i_adapter, i.config as i_config, i.secret_id as i_secret_id
    from erp_sync_jobs jb
    join erp_integrations i on i.id = jb.integration_id
    where jb.is_active and jb.revoked_at is null and i.is_active and i.revoked_at is null
      and (jb.force_run or jb.last_run_at is null or now() - jb.last_run_at >= make_interval(mins => jb.interval_minutes))
    order by jb.last_run_at nulls first
    limit greatest(coalesce(p_limit,10),1)
    for update of jb skip locked
  loop
    update erp_sync_jobs set last_run_at = now(), force_run = false where id = j.id;
    insert into erp_sync_runs (company_id, job_id, cursor_before, status)
    values (j.company_id, j.id, j.cursor, 'running') returning id into v_run;
    v_secret := null;
    if j.i_secret_id is not null then
      select decrypted_secret into v_secret from vault.decrypted_secrets where id = j.i_secret_id;
    end if;
    run_id := v_run; job_id := j.id; company_id := j.company_id; integration_id := j.integration_id;
    entity := j.entity; direction := j.direction; mode := j.mode; conflict_policy := j.conflict_policy;
    job_config := j.config; job_cursor := j.cursor; adapter := j.i_adapter; integration_config := j.i_config; secret := v_secret;
    return next;
  end loop;
end; $$;
revoke all on function erp_sync_claim_due(integer) from public, anon, authenticated;
grant execute on function erp_sync_claim_due(integer) to service_role;

create or replace function erp_sync_complete(
  p_run_id uuid, p_status text, p_pulled integer, p_written integer, p_skipped integer,
  p_failed integer, p_cursor_after text, p_error text)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_job uuid;
begin
  update erp_sync_runs set
    status = coalesce(p_status,'ok'), pulled = coalesce(p_pulled,0), written = coalesce(p_written,0),
    skipped = coalesce(p_skipped,0), failed = coalesce(p_failed,0),
    cursor_after = p_cursor_after, error = p_error, finished_at = now()
  where id = p_run_id returning job_id into v_job;
  if v_job is not null and p_cursor_after is not null then
    update erp_sync_jobs set cursor = p_cursor_after where id = v_job;
  end if;
  return v_job is not null;
end; $$;
revoke all on function erp_sync_complete(uuid,text,integer,integer,integer,integer,text,text) from public, anon, authenticated;
grant execute on function erp_sync_complete(uuid,text,integer,integer,integer,integer,text,text) to service_role;

-- ── Audit sync-job lifecycle ─────────────────────────────────────────────────
create or replace function erp_sync_jobs_audit()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  perform erp_log_audit(lower(tg_op) || '_sync_job', 'sync_job', coalesce(new.id, old.id)::text,
    jsonb_build_object('entity', coalesce(new.entity, old.entity), 'direction', coalesce(new.direction, old.direction),
                       'integration_id', coalesce(new.integration_id, old.integration_id)),
    coalesce(new.company_id, old.company_id));
  return coalesce(new, old);
end; $$;
revoke all on function erp_sync_jobs_audit() from public, anon, authenticated;
drop trigger if exists erp_sync_jobs_audit_t on erp_sync_jobs;
create trigger erp_sync_jobs_audit_t after insert or update or delete on erp_sync_jobs
  for each row execute function erp_sync_jobs_audit();
