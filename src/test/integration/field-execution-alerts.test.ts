import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FE-5e-1 — actionable alert spine + ownership lifecycle.
 * Alerts carry owner / status / created / due / resolution; severity info|warning|
 * critical; idempotent per (rule_key, dedupe_key) while open; reads are scope-aware
 * (a manager sees only their reporting subtree, admins all).
 */

/** Run a query expected to fail, recovering the aborted transaction via savepoint. */
async function rejects(c: Client, sql: string, params: unknown[], re: RegExp): Promise<void> {
  await c.query('savepoint sp');
  await expect(c.query(sql, params)).rejects.toThrow(re);
  await c.query('rollback to savepoint sp');
}

async function raise(c: Client, company: string, rep: string | null, dedupe: string, opts: Partial<{ severity: string; category: string; rule: string; metric: number; owner: string }> = {}): Promise<string> {
  const r = await c.query(
    'select erp_fe_alert_raise($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) id',
    [opts.category ?? 'coverage', opts.rule ?? 'coverage_rep_below', dedupe, 'Rep below target', opts.severity ?? 'warning',
      'rep', '{}', opts.metric ?? null, null, null, null, null, rep, null, null, opts.owner ?? null, null, company]);
  return r.rows[0].id;
}

describe.skipIf(!hasTestDb)('FE-5e-1 · alert spine + lifecycle', () => {
  it('raise is idempotent while open, and refreshes metric/severity', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEA') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'rp@x')", [admin, rep]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'rep',true)", [admin, branch, rep]);

      const id1 = await raise(c, company, rep, `rep:${rep}`, { metric: 55, severity: 'warning' });
      const id2 = await raise(c, company, rep, `rep:${rep}`, { metric: 40, severity: 'critical' }); // same dedupe → refresh
      expect(id2).toBe(id1);
      expect((await c.query('select count(*)::int n from erp_fe_alerts where company_id=$1', [company])).rows[0].n).toBe(1);
      const row = (await c.query('select severity, metric, status from erp_fe_alerts where id=$1', [id1])).rows[0];
      expect(row.severity).toBe('critical');           // refreshed
      expect(Number(row.metric)).toBe(40);

      // resolve → leaves the open partial index → a recurrence opens a NEW alert
      await actAs(c, admin);
      await c.query("select erp_fe_alert_set_status($1,'resolved','fixed route plan')", [id1]);
      await resetRole(c);
      const id3 = await raise(c, company, rep, `rep:${rep}`, { metric: 35, severity: 'critical' });
      expect(id3).not.toBe(id1);
      expect((await c.query('select count(*)::int n from erp_fe_alerts where company_id=$1', [company])).rows[0].n).toBe(2);
      const resolved = (await c.query('select status, resolution_note, resolved_at, resolved_by from erp_fe_alerts where id=$1', [id1])).rows[0];
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolution_note).toBe('fixed route plan');
      expect(resolved.resolved_at).not.toBeNull();
      expect(resolved.resolved_by).toBe(admin);
    });
  }, 30_000);

  it('reads + actions are scope-aware: a manager only sees their team, admin sees all', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEA2') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'ma@x'),($3,'ra@x'),($4,'mb@x'),($5,'rb@x')", [admin, mgrA, repA, mgrB, repB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3),($4,$2,'rep',true,$5)", [repA, branch, mgrA, repB, mgrB]);
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'supervisor','field_ops:dashboard')", [company]);
      const aA = await raise(c, company, repA, `rep:${repA}`, { metric: 50 });
      const aB = await raise(c, company, repB, `rep:${repB}`, { metric: 45 });

      // supervisor A: list shows only repA's alert; RLS hides repB's; can't act on it
      await actAs(c, mgrA);
      const listA = (await c.query('select erp_fe_alerts_list() j')).rows[0].j;
      expect(listA.length).toBe(1);
      expect(listA[0].rep_id).toBe(repA);
      expect((await c.query('select count(*)::int n from erp_fe_alerts')).rows[0].n).toBe(1); // RLS: only own scope visible
      expect((await c.query('select erp_fe_alert_in_scope($1) b', [aA])).rows[0].b).toBe(true);
      expect((await c.query('select erp_fe_alert_in_scope($1) b', [aB])).rows[0].b).toBe(false);
      await rejects(c, "select erp_fe_alert_set_status($1,'dismissed')", [aB], /forbidden/);
      // assign repB's alert? out of scope → forbidden; assign own alert to self → ok
      await rejects(c, 'select erp_fe_alert_assign($1,$2)', [aB, mgrA], /forbidden/);
      await c.query('select erp_fe_alert_assign($1,$2)', [aA, repA]);     // repA in A's team → allowed
      // can't assign to an out-of-scope owner
      await rejects(c, 'select erp_fe_alert_assign($1,$2)', [aA, repB], /out of scope/);
      const sumA = (await c.query('select erp_fe_alerts_summary() j')).rows[0].j;
      expect(sumA.open).toBe(1);
      await resetRole(c);

      // assignment took effect + bumped status to acknowledged
      expect((await c.query('select owner_id, status from erp_fe_alerts where id=$1', [aA])).rows[0].status).toBe('acknowledged');

      // admin sees both
      await actAs(c, admin);
      expect((await c.query('select erp_fe_alerts_list() j')).rows[0].j.length).toBe(2);
      expect((await c.query('select erp_fe_alerts_summary() j')).rows[0].j.open).toBe(2);
      await resetRole(c);
    });
  }, 30_000);

  it('list filters narrow within scope (Effective = Scope AND Filters)', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEA3') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'rp@x')", [admin, rep]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'rep',true)", [admin, branch, rep]);
      await raise(c, company, rep, `cov:${rep}`, { category: 'coverage', rule: 'coverage_rep_below', severity: 'warning' });
      await raise(c, company, rep, `oos:${rep}`, { category: 'oos', rule: 'oos_high_customer', severity: 'critical' });

      await actAs(c, admin);
      expect((await c.query("select erp_fe_alerts_list(null,'oos') j")).rows[0].j.length).toBe(1);
      expect((await c.query("select erp_fe_alerts_list(null,null,'critical') j")).rows[0].j.length).toBe(1);
      expect((await c.query("select erp_fe_alerts_list(array['open']) j")).rows[0].j.length).toBe(2);
      expect((await c.query("select erp_fe_alerts_list(array['resolved']) j")).rows[0].j.length).toBe(0);
      await resetRole(c);
    });
  }, 30_000);

  it('FE-5e-4: note history appends, owner filter narrows, getter is scope-checked', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEA4') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), mgr = randomUUID(), rep = randomUUID(), other = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'mg@x'),($3,'rp@x'),($4,'ot@x')", [admin, mgr, rep, other]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'supervisor',true),($4,$2,'supervisor',true)", [admin, branch, mgr, other]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3)", [rep, branch, mgr]);
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'supervisor','field_ops:dashboard')", [company]);
      const a = await raise(c, company, rep, `rep:${rep}`, { metric: 50 });

      await actAs(c, admin);
      // lifecycle with notes builds an append-only history
      await c.query("select erp_fe_alert_assign($1,$2)", [a, mgr]);
      await c.query("select erp_fe_alert_set_status($1,'in_progress','started review')", [a]);
      await c.query("select erp_fe_alert_set_status($1,'resolved','re-planned route')", [a]);
      const got = (await c.query('select erp_fe_alert_get($1) j', [a])).rows[0].j;
      expect(got.notes.length).toBe(2);                              // two noted transitions
      expect(got.notes[0].note).toBe('started review');
      expect(got.notes[1].status).toBe('resolved');
      expect(got.resolution_note).toBe('re-planned route');
      // owner filter
      expect((await c.query('select erp_fe_alerts_list(null,null,null,$1) j', [mgr])).rows[0].j.length).toBe(1);
      expect((await c.query('select erp_fe_alerts_list(null,null,null,$1) j', [other])).rows[0].j.length).toBe(0);
      await resetRole(c);

      // getter is scope-checked: another team's supervisor gets null
      await actAs(c, other);
      expect((await c.query('select erp_fe_alert_get($1) j', [a])).rows[0].j).toBeNull();
      await resetRole(c);
    });
  }, 30_000);
});
