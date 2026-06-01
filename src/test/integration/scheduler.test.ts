import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * PR-2 — scheduler wiring.
 * Job registry + runs log with last/next run, status, duration, error;
 * dispatcher runs JWT-scoped logic via admin impersonation; tick runs due jobs;
 * critical staleness raises an alert; enable/disable + manual re-run; admin-only.
 */
const u = () => randomUUID().slice(0, 8);
async function rejects(c: Client, sql: string, params: unknown[], re: RegExp): Promise<void> {
  await c.query('savepoint sp'); await expect(c.query(sql, params)).rejects.toThrow(re); await c.query('rollback to savepoint sp');
}
async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('SCH') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${u()}`])).rows[0].id;
  const admin = randomUUID(), mgr = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a${u()}@x`, mgr, `m${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'supervisor',true)", [admin, branch, mgr]);
  return { company, branch, admin, mgr };
}

describe.skipIf(!hasTestDb)('PR-2 · scheduler', () => {
  it('registers defaults, runs a job with full tracking, enable/disable', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_sched_ensure_defaults()");
      const jobs = (await c.query("select erp_sched_jobs_list() j")).rows[0].j as { id: string; key: string; enabled: boolean }[];
      expect(jobs.length).toBe(1); expect(jobs[0].key).toBe('fe_alert_detection');
      const id = jobs[0].id;
      const res = (await c.query("select erp_sched_run_job($1,'manual') j", [id])).rows[0].j;
      expect(res.ok).toBe(true);
      const job = (await c.query("select last_status, last_run_id, next_run_at, last_duration_ms from erp_sched_jobs where id=$1", [id])).rows[0];
      expect(job.last_status).toBe('ok'); expect(job.last_run_id).not.toBeNull(); expect(job.next_run_at).not.toBeNull(); expect(job.last_duration_ms).not.toBeNull();
      const runs = (await c.query("select erp_sched_runs_list($1) j", [id])).rows[0].j;
      expect(runs.length).toBe(1); expect(runs[0].status).toBe('ok'); expect(runs[0].triggered_by).toBe('manual');
      // disable
      await c.query("select erp_sched_set_enabled($1,false)", [id]);
      expect((await c.query("select enabled from erp_sched_jobs where id=$1", [id])).rows[0].enabled).toBe(false);
      await resetRole(c);
    });
  }, 30_000);

  it('tick runs due jobs (service context); staleness raises a critical alert', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_sched_ensure_defaults()");
      const id = (await c.query("select id from erp_sched_jobs where company_id=$1", [s.company])).rows[0].id;
      await c.query("update erp_sched_jobs set next_run_at = now() - interval '1 minute' where id=$1", [id]);  // make it due
      await resetRole(c);
      await c.query("select set_config('request.jwt.claim.sub','',true)");   // true service context (no auth.uid)
      // tick as service (no JWT) → runs the due job
      const tick = (await c.query("select erp_sched_tick() j")).rows[0].j;
      expect(tick.ran).toBeGreaterThanOrEqual(1);
      expect((await c.query("select last_status from erp_sched_jobs where id=$1", [id])).rows[0].last_status).toBe('ok');

      // simulate a stale critical job → check_stale raises an alert
      await c.query("update erp_sched_jobs set last_status='failed', last_run_at = now() - interval '1 day' where id=$1", [id]);
      const stale = (await c.query("select erp_sched_check_stale() j")).rows[0].j;
      expect(stale.stale).toBeGreaterThanOrEqual(1);
      expect((await c.query("select count(*)::int n from erp_fe_alerts where company_id=$1 and rule_key='scheduler_stale'", [s.company])).rows[0].n).toBe(1);
    });
  }, 30_000);

  it('only admins/owners (or the service context) may run or register', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_sched_ensure_defaults()");
      const id = (await c.query("select id from erp_sched_jobs where company_id=$1", [s.company])).rows[0].id;
      await resetRole(c);
      await actAs(c, s.mgr);   // supervisor, not admin
      await rejects(c, "select erp_sched_register('x','x',60)", [], /forbidden/);
      await rejects(c, "select erp_sched_run_job($1,'manual')", [id], /forbidden/);
      await rejects(c, "select erp_sched_tick()", [], /forbidden/);
      await resetRole(c);
    });
  }, 30_000);
});
