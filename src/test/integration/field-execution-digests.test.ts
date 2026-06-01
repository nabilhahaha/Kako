import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FE-5e-3 — scope-aware management digests.
 * Each digest is built for the calling manager and limited to their reporting
 * subtree (erp_fe_team). It leads with actions: open alerts by severity, new
 * since last digest, overdue, top-risk routes/reps, per-pillar summaries (each
 * with a drill-through href); regional/executive add Top-10 performers.
 */

async function alert(c: Client, company: string, rep: string, dedupe: string, severity = 'warning', category = 'coverage', rule = 'coverage_rep_below'): Promise<string> {
  return (await c.query('select erp_fe_alert_raise($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) id',
    [category, rule, dedupe, 'Rep below target', severity, 'rep', '{}', 40, null, null, null, null, rep, null, null, null, null, company, 'supervisor'])).rows[0].id;
}
async function merchCap(c: Client, company: string, cust: string, rep: string, ok: string): Promise<void> {
  const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
  const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,$5::jsonb,'approved') returning id", [company, form, cust, rep, JSON.stringify({ planogram_compliance: ok })])).rows[0].id;
  await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,'merchandising',$5)", [company, cust, form, sub, rep]);
}

describe.skipIf(!hasTestDb)('FE-5e-3 · management digests', () => {
  it('supervisor digest is scoped to own team; admin sees all; sections + hrefs present', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FED') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'ma@x'),($3,'ra@x'),($4,'mb@x'),($5,'rb@x')", [admin, mgrA, repA, mgrB, repB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3),($4,$2,'rep',true,$5)", [repA, branch, mgrA, repB, mgrB]);
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'supervisor','field_ops:dashboard')", [company]);
      const custA = (await c.query("insert into erp_customers(company_id, code, name, salesman_id) values($1,'CA','CA',$2) returning id", [company, repA])).rows[0].id;

      await alert(c, company, repA, `rep:${repA}`, 'critical');
      await alert(c, company, repA, `oos:${repA}`, 'warning', 'oos', 'oos_high_customer');
      await alert(c, company, repB, `rep:${repB}`, 'critical');                 // another team

      // supervisor A: only repA's two alerts; top_risk_reps just repA
      await actAs(c, mgrA);
      const d = (await c.query("select erp_fe_digest('supervisor') j")).rows[0].j;
      expect(d.kind).toBe('supervisor');
      expect(d.alerts.open).toBe(2);
      expect(d.alerts.critical).toBe(1);
      expect(d.alerts.by_category.coverage).toBe(1);
      expect(d.alerts.by_category.oos).toBe(1);
      expect(d.top_risk_reps.length).toBe(1);
      expect(d.top_risk_reps[0].rep_id).toBe(repA);
      expect(d.top_risk_reps[0].href).toBe(`/field/perf/rep/${repA}`);
      expect(d.coverage).toBeDefined; expect(d.oos.count).toBe(0);
      expect(d.performers).toBeUndefined();                                      // supervisor digest has no performers block
      await resetRole(c);

      // admin executive digest: sees both teams + Top-10 performers
      await merchCap(c, company, custA, repA, 'yes');
      await actAs(c, admin);
      const e = (await c.query("select erp_fe_digest('executive') j")).rows[0].j;
      expect(e.alerts.open).toBe(3);                                            // company-wide
      expect(e.performers).not.toBeNull();
      expect(Array.isArray(e.performers.positive)).toBe(true);
      expect(e.performers.positive.some((p: { rep_id: string }) => p.rep_id === repA)).toBe(true);
      await resetRole(c);
    });
  }, 30_000);

  it('"new since last digest" advances after a persisted run', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FED2') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'rp@x')", [admin, rep]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'rep',true)", [admin, branch, rep]);
      const old = await alert(c, company, rep, `rep:${rep}`, 'warning');
      // backdate the first alert (the harness runs in one transaction, so now() is frozen)
      await c.query("update erp_fe_alerts set created_at = now() - interval '2 hours' where id=$1", [old]);

      await actAs(c, admin);
      // first run: the existing alert is "new" (no prior run), then persist the run
      const r1 = (await c.query("select erp_fe_digest_run('supervisor') j")).rows[0].j;
      expect(r1.alerts.new_since).toBeGreaterThanOrEqual(1);
      expect((await c.query('select count(*)::int n from erp_fe_digest_runs where company_id=$1', [company])).rows[0].n).toBe(1);
      await resetRole(c);
      // simulate elapsed time: the run happened 1h ago; the old alert 2h ago
      await c.query("update erp_fe_digest_runs set created_at = now() - interval '1 hour' where company_id=$1", [company]);
      // a brand-new alert arrives now; next digest counts only it as new since the last run
      await alert(c, company, rep, `oos:${rep}`, 'critical', 'oos', 'oos_high_customer');
      await actAs(c, admin);
      const d2 = (await c.query("select erp_fe_digest('supervisor') j")).rows[0].j;
      expect(d2.alerts.new_since).toBe(1);
      await resetRole(c);
    });
  }, 30_000);
});
