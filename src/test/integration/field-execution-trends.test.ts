import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/** Field Execution (FE-5d-1) — coverage + score trends with date/route/rep filters. */

describe.skipIf(!hasTestDb)('FE-5d-1 · trends', () => {
  it('buckets coverage/compliance and execution scores by day, with filters', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FETR') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, 'a@fetr.local', rep, 'r@fetr.local']);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, rep])).rows[0].id;
      const A = (await c.query("insert into erp_customers(company_id, code, name) values($1,'A','A') returning id", [company])).rows[0].id;
      const B = (await c.query("insert into erp_customers(company_id, code, name) values($1,'B','B') returning id", [company])).rows[0].id;

      // yesterday plan: A visited (geofence ok, on day) → compliant; B missed
      const plan1 = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3, current_date - 1,'published',now()) returning id", [company, route, rep])).rows[0].id;
      const visitA = (await c.query("insert into erp_fe_visits(company_id, customer_id, rep_id, route_id, status, geofence_status, checkin_at) values($1,$2,$3,$4,'completed','ok', (current_date - 1)::timestamptz) returning id", [company, A, rep, route])).rows[0].id;
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status, visit_id) values($1,$2,$3,1,'visited',$4)", [company, plan1, A, visitA]);
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status) values($1,$2,$3,2,'planned')", [company, plan1, B]);

      // a merch capture yesterday (compliant)
      const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
      const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,'{\"planogram_compliance\":\"yes\"}'::jsonb,'approved') returning id", [company, form, A, rep])).rows[0].id;
      await c.query("insert into erp_fe_captures(company_id, visit_id, customer_id, form_id, submission_id, kind, created_by, created_at) values($1,$2,$3,$4,$5,'merchandising',$6, current_date - 1)", [company, visitA, A, form, sub, rep]);

      await actAs(c, admin);
      const cov = (await c.query("select erp_fe_coverage_trend(current_date - 2, current_date, 'day') as j")).rows[0].j;
      const y = cov.find((r: { bucket: string; coverage_pct: number }) => r.coverage_pct === 50);
      expect(y).toBeTruthy();                  // yesterday: 1/2 visited
      expect(y.compliance_pct).toBe(50);       // A compliant
      expect(y.missed).toBe(1);

      const sc = (await c.query("select erp_fe_score_trend(current_date - 2, current_date, 'day') as j")).rows[0].j;
      expect(sc.some((r: { merch_compliance: number | null }) => r.merch_compliance === 100)).toBe(true);
      expect(sc.some((r: { merch_count: number }) => r.merch_count === 1)).toBe(true);

      // route filter keeps it; a different route empties it
      expect((await c.query("select erp_fe_coverage_trend(current_date - 2, current_date, 'day', $1) as j", [route])).rows[0].j.length).toBeGreaterThan(0);
      expect((await c.query("select erp_fe_coverage_trend(current_date - 2, current_date, 'day', $1) as j", [randomUUID()])).rows[0].j).toEqual([]);
      // rep filter on scores
      expect((await c.query("select erp_fe_score_trend(current_date - 2, current_date, 'day', null, $1) as j", [rep])).rows[0].j.length).toBeGreaterThan(0);
      await resetRole(c);
    });
  }, 30_000);
});
