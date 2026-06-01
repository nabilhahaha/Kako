import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Field Execution (FE-4c) — execution scoring + rollups.
 * Captures: 2 merchandising (1 compliant) → 50%; survey score 80; 1 high-severity
 * OOS → 70; 1 opportunity value 500. Overall = avg(50,80,70) = 67.
 */

async function capture(c: Client, company: string, cust: string, rep: string, kind: string, values: object, score: number | null, visit: string | null): Promise<void> {
  const form = (await c.query("select id from erp_form_definitions where company_id is null and key = (case $1 when 'merchandising' then 'fe_merchandising_audit' when 'survey' then 'fe_store_checklist' when 'out_of_stock' then 'fe_out_of_stock' when 'opportunity' then 'fe_opportunity' else 'fe_competitor_capture' end)", [kind])).rows[0].id;
  const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,$5::jsonb,'approved') returning id", [company, form, cust, rep, JSON.stringify(values)])).rows[0].id;
  await c.query("insert into erp_fe_captures(company_id, visit_id, customer_id, form_id, submission_id, kind, score, created_by) values($1,$2,$3,$4,$5,$6,$7,$8)", [company, visit, cust, form, sub, kind, score, rep]);
}

describe.skipIf(!hasTestDb)('FE-4c · execution scores', () => {
  it('computes component + overall scores and rolls up by customer / rep / visit', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FESC') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, 'a@fesc.local', rep, 'r@fesc.local']);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'rep',true)", [rep, branch]);
      const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, rep])).rows[0].id;
      const cust = (await c.query("insert into erp_customers(company_id, code, name, route_id) values($1,'C1','Store',$2) returning id", [company, route])).rows[0].id;
      const visit = (await c.query("insert into erp_fe_visits(company_id, customer_id, rep_id, route_id, status) values($1,$2,$3,$4,'completed') returning id", [company, cust, rep, route])).rows[0].id;

      await capture(c, company, cust, rep, 'merchandising', { planogram_compliance: 'yes' }, null, visit);
      await capture(c, company, cust, rep, 'merchandising', { planogram_compliance: 'no' }, null, visit);
      await capture(c, company, cust, rep, 'survey', { score: '80' }, 80, visit);
      await capture(c, company, cust, rep, 'out_of_stock', { severity: 'high' }, null, visit);
      await capture(c, company, cust, rep, 'opportunity', { est_value: '500' }, null, visit);

      await actAs(c, admin);
      const byCust = (await c.query("select erp_fe_execution_scores('customer', $1) as j", [cust])).rows[0].j;
      expect(byCust.merch_compliance).toBe(50);
      expect(byCust.survey_score).toBe(80);
      expect(byCust.oos_score).toBe(70);            // 100 - 30 (high)
      expect(byCust.oos_count).toBe(1);
      expect(byCust.opportunity_score).toBe(75);    // 50 + 25*1
      expect(byCust.opportunity_count).toBe(1);
      expect(Number(byCust.opportunity_value)).toBe(500);
      expect(byCust.overall).toBe(69);              // avg(50,80,70,75)
      expect(byCust.captures).toBe(5);

      // rollups by rep + visit return the same composition here, with full breakdown
      const byRep = (await c.query("select erp_fe_execution_scores('rep', $1) as j", [rep])).rows[0].j;
      expect(byRep).toMatchObject({ overall: 69, merch_compliance: 50, survey_score: 80, oos_score: 70, opportunity_score: 75 });
      expect((await c.query("select erp_fe_execution_scores('visit', $1) as j", [visit])).rows[0].j.overall).toBe(69);
      expect((await c.query("select erp_fe_execution_scores('route', $1) as j", [route])).rows[0].j.merch_compliance).toBe(50);

      // the visit timeline now carries a per-visit overall score
      const tl = (await c.query("select erp_fe_customer_visits($1) as j", [cust])).rows[0].j;
      expect(Number(tl[0].score)).toBe(69);
      await resetRole(c);
    });
  }, 30_000);
});
