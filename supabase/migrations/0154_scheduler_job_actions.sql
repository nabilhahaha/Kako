-- ============================================================================
-- 0154: Scheduler — additional job actions (promotion activation + placeholders)
-- ----------------------------------------------------------------------------
-- Extends the dispatcher so the standard FMCG scheduled jobs are runnable:
--   • fe_alert_detection  → run alert rules (0152)
--   • promotion_activation→ activate approved promotions whose window has opened
--   • erp_sync            → recognized no-op (real sync runs via erp_sync_jobs /
--                           erp_sync_ingest; placeholder so the job is healthy)
--   • daily_digest        → recognized no-op (digests are per-recipient, run
--                           interactively / per manager)
-- Same impersonation + run-tracking as 0152.
-- ============================================================================
create or replace function erp_sched_run_job(p_job_id uuid, p_triggered_by text default 'manual')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare j erp_sched_jobs; v_admin uuid; v_run uuid; v_start timestamptz := clock_timestamp(); v_ok boolean := true; v_err text; v_prev text; v_uid uuid := (select auth.uid()); v_ms int;
begin
  select * into j from erp_sched_jobs where id=p_job_id; if not found then raise exception 'not found'; end if;
  if v_uid is not null and not ((select erp_is_platform_owner()) or (select erp_is_company_admin(j.company_id))) then raise exception 'forbidden'; end if;
  insert into erp_sched_runs (job_id, company_id, started_at, status, triggered_by, actor) values (p_job_id, j.company_id, v_start, 'running', coalesce(p_triggered_by,'manual'), v_uid) returning id into v_run;
  select ub.user_id into v_admin from erp_user_branches ub join erp_branches b on b.id=ub.branch_id where b.company_id=j.company_id and ub.role='admin' order by ub.is_default desc nulls last limit 1;
  v_prev := current_setting('request.jwt.claim.sub', true);
  begin
    if v_admin is not null then perform set_config('request.jwt.claim.sub', v_admin::text, true); end if;
    if j.key = 'fe_alert_detection' then perform erp_fe_run_alert_rules();
    elsif j.key = 'promotion_activation' then
      update erp_tpm_promotions set status='active', updated_at=now()
        where company_id=j.company_id and status='approved' and starts_on <= current_date and ends_on >= current_date;
    elsif j.key in ('erp_sync','daily_digest') then perform 1;   -- recognized placeholder
    else raise exception 'unknown job key: %', j.key; end if;
  exception when others then v_ok := false; v_err := SQLERRM;
  end;
  perform set_config('request.jwt.claim.sub', coalesce(v_prev,''), true);
  v_ms := (extract(epoch from (clock_timestamp()-v_start))*1000)::int;
  update erp_sched_runs set finished_at=clock_timestamp(), status=case when v_ok then 'ok' else 'failed' end, duration_ms=v_ms, error=v_err where id=v_run;
  update erp_sched_jobs set last_run_at=now(), last_status=case when v_ok then 'ok' else 'failed' end, last_duration_ms=v_ms, last_error=v_err, last_run_id=v_run,
    next_run_at = now() + (interval_minutes||' minutes')::interval where id=p_job_id;
  return jsonb_build_object('ok', v_ok, 'run_id', v_run, 'duration_ms', v_ms, 'error', v_err);
end; $$;
revoke all on function erp_sched_run_job(uuid, text) from public, anon; grant execute on function erp_sched_run_job(uuid, text) to authenticated;

-- ROLLBACK (manual): restore the 0152 body of erp_sched_run_job (fe_alert_detection only).
