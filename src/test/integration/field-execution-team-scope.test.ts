import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Field Execution (FE-5d-3) — manager dashboards/drill pages are TEAM-scoped.
 * Two supervisors, each with one rep + customer + capture. Proves: a manager sees
 * only their team, cannot reach another team's data (even by id), admin sees all.
 */

async function capFor(c: Client, company: string, cust: string, rep: string): Promise<void> {
  const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
  const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,'{\"planogram_compliance\":\"yes\"}'::jsonb,'approved') returning id", [company, form, cust, rep])).rows[0].id;
  await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,'merchandising',$5)", [company, cust, form, sub, rep]);
}

describe.skipIf(!hasTestDb)('FE-5d-3 · team-scoped visibility', () => {
  it('manager sees own team only; cannot reach another team; admin sees all', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FETS') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'ma@x'),($3,'ra@x'),($4,'mb@x'),($5,'rb@x')", [admin, mgrA, repA, mgrB, repB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      // two supervisors, each a rep reporting up to them
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3)", [repA, branch, mgrA]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3)", [repB, branch, mgrB]);
      // both supervisors can view field ops
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'supervisor','field_ops:view')", [company]);

      const custA = (await c.query("insert into erp_customers(company_id, code, name) values($1,'CA','A') returning id", [company])).rows[0].id;
      const custB = (await c.query("insert into erp_customers(company_id, code, name) values($1,'CB','B') returning id", [company])).rows[0].id;
      await capFor(c, company, custA, repA);
      await capFor(c, company, custB, repB);

      // (1) manager A sees only their team
      await actAs(c, mgrA);
      expect((await c.query("select array(select erp_fe_team())::uuid[] as t")).rows[0].t.sort()).toEqual([mgrA, repA].sort());
      expect((await c.query("select erp_fe_perf('company') as j")).rows[0].j.metrics.captures).toBe(1);   // only repA's
      expect((await c.query("select erp_fe_perf('rep',$1) as j", [repA])).rows[0].j.metrics.captures).toBe(1);
      expect((await c.query("select erp_fe_execution_scores('company') as j")).rows[0].j.captures).toBe(1);
      // (2) manager A cannot reach manager B's rep — even by id
      expect((await c.query("select erp_fe_perf('rep',$1) as j", [repB])).rows[0].j.metrics.captures).toBe(0);
      expect((await c.query("select erp_fe_perf('customer',$1) as j", [custB])).rows[0].j.metrics.captures).toBe(0);
      await resetRole(c);

      // manager B symmetric: sees only repB
      await actAs(c, mgrB);
      expect((await c.query("select erp_fe_perf('company') as j")).rows[0].j.metrics.captures).toBe(1);
      expect((await c.query("select erp_fe_perf('rep',$1) as j", [repA])).rows[0].j.metrics.captures).toBe(0);
      await resetRole(c);

      // (3) admin sees all
      await actAs(c, admin);
      expect((await c.query("select erp_fe_sees_all() as a")).rows[0].a).toBe(true);
      expect((await c.query("select erp_fe_perf('company') as j")).rows[0].j.metrics.captures).toBe(2);
      expect((await c.query("select erp_fe_execution_scores('company') as j")).rows[0].j.captures).toBe(2);
      await resetRole(c);
    });
  }, 30_000);
});
