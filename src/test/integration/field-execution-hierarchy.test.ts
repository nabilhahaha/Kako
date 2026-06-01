import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/** Field Execution (FE-5d-3) — configurable hierarchy perf engine. */

async function cap(c: Client, company: string, cust: string, rep: string, visit: string, kind: string, values: object): Promise<void> {
  const form = (await c.query("select id from erp_form_definitions where company_id is null and key=(case $1 when 'merchandising' then 'fe_merchandising_audit' when 'out_of_stock' then 'fe_out_of_stock' when 'opportunity' then 'fe_opportunity' else 'fe_competitor_capture' end)", [kind])).rows[0].id;
  const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,$5::jsonb,'approved') returning id", [company, form, cust, rep, JSON.stringify(values)])).rows[0].id;
  await c.query("insert into erp_fe_captures(company_id, visit_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,$5,$6,$7)", [company, visit, cust, form, sub, kind, rep]);
}

describe.skipIf(!hasTestDb)('FE-5d-3 · perf engine across levels', () => {
  it('aggregates metrics for any level and lists children at the next level', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEH') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name, region, area) values($1,'B','Main','North','A1') returning id", [company])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, 'a@feh.local', rep, 'r@feh.local']);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, rep])).rows[0].id;
      const cust = (await c.query("insert into erp_customers(company_id, code, name, branch_id, route_id) values($1,'C1','Store',$2,$3) returning id", [company, branch, route])).rows[0].id;
      const visit = (await c.query("insert into erp_fe_visits(company_id, customer_id, rep_id, route_id, status, geofence_status, checkin_at) values($1,$2,$3,$4,'completed','ok', current_date::timestamptz) returning id", [company, cust, rep, route])).rows[0].id;
      // a covered stop today
      const plan = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3, current_date,'published',now()) returning id", [company, route, rep])).rows[0].id;
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status, visit_id) values($1,$2,$3,1,'visited',$4)", [company, plan, cust, visit]);

      await cap(c, company, cust, rep, visit, 'merchandising', { planogram_compliance: 'yes' });
      await cap(c, company, cust, rep, visit, 'out_of_stock', { severity: 'high' });
      await cap(c, company, cust, rep, visit, 'opportunity', { est_value: '500' });

      await actAs(c, admin);
      // company node
      const co = (await c.query("select erp_fe_perf('company') as j")).rows[0].j;
      expect(co.metrics).toMatchObject({ coverage_pct: 100, merch_compliance: 100, oos_score: 70, opportunity_score: 75, overall: 82, captures: 3 });

      // region / route nodes resolve the same customer's data
      expect((await c.query("select erp_fe_perf('region','North') as j")).rows[0].j.metrics.merch_compliance).toBe(100);
      const rt = (await c.query("select erp_fe_perf('route',$1) as j", [route])).rows[0].j;
      expect(rt.name).toBe('R1');
      expect(rt.metrics.coverage_pct).toBe(100);
      expect(Array.isArray(rt.score_trend)).toBe(true);

      // children: company → branch, region → route, route → customer
      const branches = (await c.query("select erp_fe_perf_children('company', null, 'branch') as j")).rows[0].j;
      expect(branches.some((b: { id: string; overall: number }) => b.id === branch && b.overall === 82)).toBe(true);
      const routes = (await c.query("select erp_fe_perf_children('region','North','route') as j")).rows[0].j;
      expect(routes.some((r: { id: string }) => r.id === route)).toBe(true);
      const custs = (await c.query("select erp_fe_perf_children('route',$1,'customer') as j", [route])).rows[0].j;
      expect(custs.some((x: { id: string; coverage_pct: number }) => x.id === cust && x.coverage_pct === 100)).toBe(true);
      await resetRole(c);
    });
  }, 30_000);
});
