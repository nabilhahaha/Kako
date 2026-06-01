import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/** Field Execution (FE-3c) — plan generation + publish. */

async function seed(c: Client, tag: string) {
  const company = (await c.query("insert into erp_companies(name) values($1) returning id", [`FEG_${tag}`])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${tag}`.slice(0, 8)])).rows[0].id;
  const admin = randomUUID(), rep = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a_${tag}@feg.local`, rep, `r_${tag}@feg.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
  const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, rep])).rows[0].id;
  return { company, branch, admin, rep, route };
}

describe.skipIf(!hasTestDb)('FE-3c · generate + publish', () => {
  it('generates due stops (idempotent) and publishes with notification + planned facts', async () => {
    await withRollback(async (c) => {
      const t = await seed(c, 'GEN');
      // two daily-due customers on the route (A priority A, B priority B) + one not due
      const a = (await c.query("insert into erp_customers(company_id, code, name, route_id) values($1,$2,'Acme',$3) returning id", [t.company, `C-${randomUUID().slice(0, 5)}`, t.route])).rows[0].id;
      const b = (await c.query("insert into erp_customers(company_id, code, name, route_id) values($1,$2,'Bravo',$3) returning id", [t.company, `C-${randomUUID().slice(0, 5)}`, t.route])).rows[0].id;
      const z = (await c.query("insert into erp_customers(company_id, code, name, route_id) values($1,$2,'Zeta',$3) returning id", [t.company, `C-${randomUUID().slice(0, 5)}`, t.route])).rows[0].id;
      await c.query("insert into erp_fe_customer_frequency(company_id, customer_id, route_id, frequency, priority) values($1,$2,$3,'daily','A')", [t.company, a, t.route]);
      await c.query("insert into erp_fe_customer_frequency(company_id, customer_id, route_id, frequency, priority) values($1,$2,$3,'daily','B')", [t.company, b, t.route]);
      // z has a rule but inactive → not due
      await c.query("insert into erp_fe_customer_frequency(company_id, customer_id, route_id, frequency, active) values($1,$2,$3,'daily',false)", [t.company, z, t.route]);

      await actAs(c, t.admin);
      const gen = (await c.query("select erp_fe_generate_plan($1, current_date) as j", [t.route])).rows[0].j;
      expect(gen.stops).toBe(2);
      expect(gen.added).toBe(2);
      // priority A sorts before B
      const stops = (await c.query("select customer_id, priority, seq from erp_fe_route_stops where plan_id=$1 order by seq", [gen.plan_id])).rows;
      expect(stops[0].customer_id).toBe(a);
      expect(stops[0].priority).toBe('A');

      // idempotent: re-generate adds nothing
      const gen2 = (await c.query("select erp_fe_generate_plan($1, current_date) as j", [t.route])).rows[0].j;
      expect(gen2.added).toBe(0);
      expect(gen2.stops).toBe(2);

      // publish → status, rep notification, planned facts per due stop
      const pub = (await c.query("select erp_fe_publish_plan($1) as j", [gen.plan_id])).rows[0].j;
      expect(pub).toMatchObject({ published: true, stops: 2 });
      expect((await c.query("select status from erp_fe_route_plans where id=$1", [gen.plan_id])).rows[0].status).toBe('published');
      await resetRole(c);

      expect((await c.query("select count(*)::int n from erp_notifications where user_id=$1 and type='fe_route_published'", [t.rep])).rows[0].n).toBe(1);
      expect((await c.query("select count(*)::int n from erp_raw_facts where module='field_ops' and event_type='fe_visit_planned' and route_id=$1", [t.route])).rows[0].n).toBe(2);
    });
  }, 30_000);
});
