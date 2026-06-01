import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Core rule: Effective Result = User Allowed Scope AND Selected Filters.
 * A supervisor filtering Channel=Discounter sees only Discounter customers WITHIN
 * their own scope — never the company's Discounter customers on another team.
 */

async function capFor(c: Client, company: string, cust: string, rep: string): Promise<void> {
  const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
  const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,'{\"planogram_compliance\":\"yes\"}'::jsonb,'approved') returning id", [company, form, cust, rep])).rows[0].id;
  await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,'merchandising',$5)", [company, cust, form, sub, rep]);
}

describe.skipIf(!hasTestDb)('Filter scope · Effective = Scope AND Filter', () => {
  it('a supervisor filtering by channel stays within their own scope; admin sees all', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEFS') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'ma@x'),($3,'ra@x'),($4,'mb@x'),($5,'rb@x')", [admin, mgrA, repA, mgrB, repB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3),($4,$2,'rep',true,$5)", [repA, branch, mgrA, repB, mgrB]);
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'supervisor','field_ops:view')", [company]);

      // team A: retail + discounter customers (owned by repA); team B: a discounter customer (repB)
      const a1 = (await c.query("insert into erp_customers(company_id, code, name, channel, salesman_id) values($1,'A1','A1','retail',$2) returning id", [company, repA])).rows[0].id;
      const a2 = (await c.query("insert into erp_customers(company_id, code, name, channel, salesman_id) values($1,'A2','A2','discounter',$2) returning id", [company, repA])).rows[0].id;
      const b1 = (await c.query("insert into erp_customers(company_id, code, name, channel, salesman_id) values($1,'B1','B1','discounter',$2) returning id", [company, repB])).rows[0].id;
      await capFor(c, company, a1, repA);
      await capFor(c, company, a2, repA);
      await capFor(c, company, b1, repB);

      // supervisor A
      await actAs(c, mgrA);
      // the filter dropdown only offers channels within scope
      expect((await c.query("select erp_fe_scope_channels() s")).rows[0].s.sort()).toEqual(['discounter', 'retail']);
      // Channel=Discounter → only A's discounter customer (NOT B's company-wide discounter)
      expect((await c.query("select erp_fe_perf('company',null,null,null,'week','discounter') as j")).rows[0].j.metrics.captures).toBe(1);
      expect((await c.query("select erp_fe_perf('company',null,null,null,'week','retail') as j")).rows[0].j.metrics.captures).toBe(1);
      expect((await c.query("select erp_fe_perf('company') as j")).rows[0].j.metrics.captures).toBe(2); // unfiltered, still scoped
      await resetRole(c);

      // supervisor B only has a discounter channel in scope
      await actAs(c, mgrB);
      expect((await c.query("select erp_fe_scope_channels() s")).rows[0].s).toEqual(['discounter']);
      expect((await c.query("select erp_fe_perf('company',null,null,null,'week','discounter') as j")).rows[0].j.metrics.captures).toBe(1);
      await resetRole(c);

      // admin: Channel=Discounter spans the whole company (both A2 and B1)
      await actAs(c, admin);
      expect((await c.query("select erp_fe_perf('company',null,null,null,'week','discounter') as j")).rows[0].j.metrics.captures).toBe(2);
      await resetRole(c);
    });
  }, 30_000);
});
