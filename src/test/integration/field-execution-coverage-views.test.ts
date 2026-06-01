import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/** Field Execution (FE-3d) — next-due, coverage lists, 360 adherence. */

async function seed(c: Client, tag: string) {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FED_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID(), rep = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a_${tag}@fed.local`, rep, `r_${tag}@fed.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
  return { company, branch, admin, rep };
}
async function cust(c: Client, company: string, name = 'S'): Promise<string> {
  return (await c.query("insert into erp_customers(company_id, code, name, latitude, longitude) values($1,$2,$3,30.0,31.0) returning id", [company, `C-${randomUUID().slice(0, 6)}`, name])).rows[0].id;
}

describe.skipIf(!hasTestDb)('FE-3d · next_due + coverage_lists + 360 adherence', () => {
  it('computes next due, due-soon/missed lists and 30-day adherence', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'NEXT');
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [t.company, t.rep])).rows[0].id;
      const a = await cust(c, t.company, 'Acme');

      // weekly on a fixed weekday → next_due is that weekday on/after today
      const probe = '2026-06-10';
      const dow = (await c.query("select extract(dow from $1::date)::int d", [probe])).rows[0].d as number;
      await c.query("insert into erp_fe_customer_frequency(company_id, customer_id, route_id, frequency, weekdays) values($1,$2,$3,'weekly',$4)", [t.company, a, route, [dow]]);
      const ndDow = (await c.query("select extract(dow from erp_fe_next_due($1, current_date))::int d", [a])).rows[0].d as number;
      expect(ndDow).toBe(dow);

      // a missed stop yesterday + a visited stop yesterday → adherence 50%
      const planY = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3, current_date - 1,'published',now()) returning id", [t.company, route, t.rep])).rows[0].id;
      const b = await cust(c, t.company, 'Bravo');
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status) values($1,$2,$3,1,'visited')", [t.company, planY, a]); // fulfilled
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status) values($1,$2,$3,2,'planned')", [t.company, planY, b]); // will be missed

      await actAs(c, t.admin);
      const lists = (await c.query("select erp_fe_coverage_lists(7) as j")).rows[0].j;
      expect(lists.missed.some((m: { customer_id: string }) => m.customer_id === b)).toBe(true);   // B past-due unvisited
      expect(Array.isArray(lists.due_soon)).toBe(true);

      // 360 adherence for A: 30-day planned=1 (visited) → fulfilled 1 → 100%
      const f360 = (await c.query("select erp_customer_field_360($1) as j", [a])).rows[0].j;
      expect(f360.frequency).toBe('weekly');
      expect(f360.next_due).not.toBeNull();
      expect(f360.planned_30d).toBe(1);
      expect(f360.fulfilled_30d).toBe(1);
      expect(f360.adherence_pct).toBe(100);
      await resetRole(c);
    });
  }, 30_000);
});
