import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Field Execution (FE-2e) — manager visibility + customer visit timeline.
 * Seeds a couple of visits (one in-geofence, one violation) and checks the
 * dashboard summary (today KPIs, prioritized alerts, route breakdown) and the
 * per-customer visit timeline. Rolled-back transaction.
 */

async function seed(c: Client, tag: string) {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FEE_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID(), rep = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a_${tag}@fee.local`, rep, `r_${tag}@fee.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
  return { company, branch, admin, rep };
}

describe.skipIf(!hasTestDb)('FE-2e · manager summary + customer timeline', () => {
  it('aggregates today KPIs, prioritized alerts and the customer timeline', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'SUM');
      const near = (await c.query("insert into erp_customers(company_id, code, name, latitude, longitude) values($1,$2,'Near',30.0,31.0) returning id", [t.company, `C-${randomUUID().slice(0, 6)}`])).rows[0].id;
      const far = (await c.query("insert into erp_customers(company_id, code, name, latitude, longitude) values($1,$2,'Far',30.0,31.0) returning id", [t.company, `C-${randomUUID().slice(0, 6)}`])).rows[0].id;

      await actAs(c, t.rep);
      const r1 = randomUUID(), r2 = randomUUID();
      await c.query("select erp_fe_visit_start($1,$2,30.0,31.0,5,now()) as r", [r1, near]);              // ok
      await c.query("select erp_fe_visit_end($1,30.0,31.0,now()) as r", [r1]);                            // completed
      await c.query("select erp_fe_visit_start($1,$2,30.004,31.0,8,now(),null,'Stall moved') as r", [r2, far]); // ~440 m → violation
      await resetRole(c);

      // Manager dashboard summary (as admin)
      await actAs(c, t.admin);
      const sum = (await c.query("select erp_fe_manager_summary() as j")).rows[0].j;
      expect(sum.today.visits).toBe(2);
      expect(sum.today.completed).toBe(1);
      expect(sum.today.geofence_violations).toBe(1);
      expect(sum.today.customers_covered).toBe(2);
      expect(Array.isArray(sum.alerts)).toBe(true);
      expect(sum.alerts.length).toBe(1);
      expect(sum.alerts[0]).toMatchObject({ type: 'geofence', customer: 'Far', reason: 'Stall moved' });
      expect(Number(sum.alerts[0].distance_m)).toBeGreaterThan(150);

      // Customer visit timeline
      const tl = (await c.query("select erp_fe_customer_visits($1) as j", [near])).rows[0].j;
      expect(tl.length).toBe(1);
      expect(tl[0]).toMatchObject({ status: 'completed', geofence_status: 'ok' });
      await resetRole(c);
    });
  }, 30_000);

  it('forbids the summary without field_ops access', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'DENY');
      // a plain member with no field_ops grant (role 'cashier' has none by default)
      const outsider = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2)", [outsider, `o@deny.local`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'cashier',true)", [outsider, t.branch]);
      await c.query('savepoint sp');
      await actAs(c, outsider);
      let threw = false;
      try { await c.query("select erp_fe_manager_summary()"); }
      catch (e) { threw = true; expect(String((e as Error).message)).toMatch(/forbidden/); }
      expect(threw).toBe(true);
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);
});
