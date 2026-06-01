import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Field Execution (FE-3a) — frequency rules, plans, stops and visit→stop linkage.
 * Verifies erp_fe_customer_due across patterns, RLS on the planning tables, and
 * that a check-in fulfils its planned stop (and off-plan visits stay unlinked).
 * Rolled-back transaction.
 */

async function seed(c: Client, tag: string) {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FER_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID(), rep = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a_${tag}@fer.local`, rep, `r_${tag}@fer.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
  return { company, branch, admin, rep };
}
async function customer(c: Client, company: string, lat: number | null = 30, lng: number | null = 31): Promise<string> {
  return (await c.query("insert into erp_customers(company_id, code, name, latitude, longitude) values($1,$2,'Store',$3,$4) returning id", [company, `C-${randomUUID().slice(0, 6)}`, lat, lng])).rows[0].id;
}

describe.skipIf(!hasTestDb)('FE-3a · erp_fe_customer_due (frequency patterns)', () => {
  it('evaluates daily / weekly weekday-mask / monthly week-of-month', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'DUE');
      const cust = await customer(c, t.company);
      const D = '2026-06-08'; // a fixed Monday
      const dow = (await c.query("select extract(dow from $1::date)::int d", [D])).rows[0].d as number;
      const otherDay = '2026-06-09'; // next day (different dow)

      // weekly on that weekday → due on D, not on the next day
      await c.query("insert into erp_fe_customer_frequency(company_id, customer_id, frequency, weekdays) values($1,$2,'weekly',$3)", [t.company, cust, [dow]]);
      expect((await c.query("select erp_fe_customer_due($1,$2) d", [cust, D])).rows[0].d).toBe(true);
      expect((await c.query("select erp_fe_customer_due($1,$2) d", [cust, otherDay])).rows[0].d).toBe(false);

      // daily → always due
      await c.query("update erp_fe_customer_frequency set frequency='daily' where customer_id=$1", [cust]);
      expect((await c.query("select erp_fe_customer_due($1,$2) d", [cust, otherDay])).rows[0].d).toBe(true);

      // monthly, first week only: due on the 1st-week match, not a later week
      const wom = ((Number((await c.query("select extract(day from $1::date)::int x", [D])).rows[0].x) - 1) / 7 | 0) + 1;
      await c.query("update erp_fe_customer_frequency set frequency='monthly', weekdays=$2, week_of_month=$3 where customer_id=$1", [cust, [dow], [wom]]);
      expect((await c.query("select erp_fe_customer_due($1,$2) d", [cust, D])).rows[0].d).toBe(true);
      expect((await c.query("select erp_fe_customer_due($1, ($2::date + 14)) d", [cust, D])).rows[0].d).toBe(false); // +2 weeks, same weekday, different week-of-month
    });
  }, 30_000);

  it('returns false when the customer has no (active) rule', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'NORULE');
      const cust = await customer(c, t.company);
      expect((await c.query("select erp_fe_customer_due($1,'2026-06-08') d", [cust])).rows[0].d).toBe(false);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-3a · planning RLS', () => {
  it('lets a planner (admin) write plans/stops; a rep can read own plan but not write', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'RLS');
      const cust = await customer(c, t.company);
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [t.company, t.rep])).rows[0].id;

      await actAs(c, t.admin);
      const plan = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3,'2026-06-08','published',now()) returning id", [t.company, route, t.rep])).rows[0].id;
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq) values($1,$2,$3,1)", [t.company, plan, cust]);
      await resetRole(c);

      // rep sees their own plan + stop
      await actAs(c, t.rep);
      expect((await c.query("select count(*)::int n from erp_fe_route_plans where id=$1", [plan])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from erp_fe_route_stops where plan_id=$1", [plan])).rows[0].n).toBe(1);
      // but cannot create a plan (no field_ops:plan)
      await c.query('savepoint sp');
      const ins = await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date) values($1,$2,$3,'2026-06-09') returning id", [t.company, route, t.rep]).then(() => 'ok').catch(() => 'denied');
      expect(ins).toBe('denied');
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);
});

describe.skipIf(!hasTestDb)('FE-3a · visit → stop linkage', () => {
  it('a check-in fulfils its planned stop and stamps the visit plan_id', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'LINK');
      const cust = await customer(c, t.company, 30.0, 31.0);
      const offPlan = await customer(c, t.company, 30.0, 31.0);
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [t.company, t.rep])).rows[0].id;
      const today = new Date().toISOString().slice(0, 10);
      const plan = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3,$4,'published',now()) returning id", [t.company, route, t.rep, today])).rows[0].id;
      const stop = (await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq) values($1,$2,$3,1) returning id", [t.company, plan, cust])).rows[0].id;

      await actAs(c, t.rep);
      const planned = (await c.query("select erp_fe_visit_start($1,$2,30,31,5,now()) as r", [randomUUID(), cust])).rows[0].r;
      const off = (await c.query("select erp_fe_visit_start($1,$2,30,31,5,now()) as r", [randomUUID(), offPlan])).rows[0].r;
      await resetRole(c);

      // the planned stop is now visited and linked to the visit
      const sRow = (await c.query("select status, visit_id from erp_fe_route_stops where id=$1", [stop])).rows[0];
      expect(sRow.status).toBe('visited');
      expect(sRow.visit_id).toBe(planned.id);
      // the planned visit got its plan_id stamped; the off-plan visit did not
      expect((await c.query("select plan_id from erp_fe_visits where id=$1", [planned.id])).rows[0].plan_id).toBe(plan);
      expect((await c.query("select plan_id from erp_fe_visits where id=$1", [off.id])).rows[0].plan_id).toBeNull();
    });
  }, 30_000);
});
