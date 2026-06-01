import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Field Execution (FE-3b) — coverage engine.
 * Scenario on a YESTERDAY plan (so missed applies): A visited in-geofence
 * (compliant), B visited out-of-geofence (visited, not compliant), C unvisited
 * (missed); plus an off-plan visit today. Asserts erp_fe_coverage totals and
 * groupings, and erp_fe_close_plan finalize + fe_coverage_daily emission.
 */

async function seed(c: Client, tag: string) {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FEC_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID(), rep = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a_${tag}@fec.local`, rep, `r_${tag}@fec.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
  await c.query("insert into erp_fe_settings(company_id) values($1)", [company]); // advisory, radius 150, photo>500
  return { company, branch, admin, rep };
}
async function cust(c: Client, company: string): Promise<string> {
  return (await c.query("insert into erp_customers(company_id, code, name, latitude, longitude) values($1,$2,'S',30.0,31.0) returning id", [company, `C-${randomUUID().slice(0, 6)}`])).rows[0].id;
}

describe.skipIf(!hasTestDb)('FE-3b · coverage + compliance + close plan', () => {
  it('computes coverage/compliance/missed/off-plan and emits the daily fact on close', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'COV');
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [t.company, t.rep])).rows[0].id;
      const A = await cust(c, t.company), B = await cust(c, t.company), C = await cust(c, t.company), D = await cust(c, t.company);

      // a plan dated yesterday with three due stops
      const plan = (await c.query(
        "insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3, current_date - 1, 'published', now()) returning id",
        [t.company, route, t.rep],
      )).rows[0].id;
      for (const x of [A, B, C]) await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq) values($1,$2,$3,1)", [t.company, plan, x]);

      await actAs(c, t.rep);
      // A visited in-geofence yesterday → compliant
      await c.query("select erp_fe_visit_start($1,$2,30.0,31.0,5, now() - interval '1 day') as r", [randomUUID(), A]);
      // B visited out-of-geofence yesterday (~310 m, advisory, reason) → visited, not compliant
      await c.query("select erp_fe_visit_start($1,$2,30.0020,31.0,8, now() - interval '1 day', null, 'Moved') as r", [randomUUID(), B]);
      // D off-plan visit today
      await c.query("select erp_fe_visit_start($1,$2,30.0,31.0,5, now()) as r", [randomUUID(), D]);
      await resetRole(c);

      await actAs(c, t.admin);
      const cov = (await c.query("select erp_fe_coverage(current_date - 1, current_date, 'total') as j")).rows[0].j;
      expect(cov.totals.planned).toBe(3);
      expect(cov.totals.visited).toBe(2);          // A, B
      expect(cov.totals.missed).toBe(1);           // C (past-due, unvisited) — lazy
      expect(cov.totals.off_plan).toBe(1);         // D
      expect(cov.totals.coverage_pct).toBe(67);    // 2/3
      expect(cov.totals.compliance_pct).toBe(33);  // only A compliant → 1/3

      // grouping by route returns a row keyed by the route name
      const byRoute = (await c.query("select erp_fe_coverage(current_date - 1, current_date, 'route') as j")).rows[0].j;
      expect(byRoute.groups.some((g: { key: string; planned: number }) => g.key === 'R1' && g.planned === 3)).toBe(true);

      // close the plan → C becomes missed, status done, daily fact emitted
      const closed = (await c.query("select erp_fe_close_plan($1) as j", [plan])).rows[0].j;
      expect(closed).toMatchObject({ planned: 3, visited: 2, missed: 1, coverage_pct: 67 });
      expect((await c.query("select status from erp_fe_route_plans where id=$1", [plan])).rows[0].status).toBe('done');
      expect((await c.query("select status from erp_fe_route_stops where plan_id=$1 and customer_id=$2", [plan, C])).rows[0].status).toBe('missed');
      const fact = (await c.query("select quantity, details from erp_raw_facts where module='field_ops' and event_type='fe_coverage_daily' and entity_id=$1", [plan])).rows[0];
      expect(Number(fact.quantity)).toBe(2);
      expect(Number(fact.details.coverage_pct)).toBe(67);
      await resetRole(c);
    });
  }, 30_000);

  it('forbids coverage without field_ops access', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'DENY');
      const outsider = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2)", [outsider, 'o@cov.local']);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'cashier',true)", [outsider, t.branch]);
      await c.query('savepoint sp');
      await actAs(c, outsider);
      const r = await c.query("select erp_fe_coverage(current_date - 7, current_date, 'route')").then(() => 'ok').catch((e: Error) => e.message);
      expect(String(r)).toMatch(/forbidden/);
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);
});
