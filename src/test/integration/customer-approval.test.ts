import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Customer Approval Workflow (0109) — the permission-based approver type.
 * Proves: `erp_user_has_permission` resolves customers.approve; a holder can
 * decide a customer-onboarding task while a non-holder cannot; the instance
 * completes as approved. (The status mirror + staged-change apply live in the TS
 * outcome handler, covered separately.) Gated on TEST_DATABASE_URL.
 */

async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1, $2)', [id, `u+${id}@test.local`]);
  return id;
}
async function assign(c: Client, userId: string, branchId: string, role: string): Promise<void> {
  await c.query('insert into erp_user_branches(user_id, branch_id, role, is_default) values ($1,$2,$3,true)', [userId, branchId, role]);
}

describe.skipIf(!hasTestDb)('customer approval · permission-based decide', () => {
  it('customers.approve holder decides; non-holder is rejected', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('CA_WF') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const approver = await mkUser(c);  // admin holds customers.approve (seeded in 0109)
      const rep = await mkUser(c);       // salesman does not
      await assign(c, approver, branch, 'admin');
      await assign(c, rep, branch, 'salesman');
      const customer = (await c.query("insert into erp_customers(company_id,code,name) values ($1,'CA-1','CA-1') returning id", [company])).rows[0].id;

      // (erp_user_has_permission is an internal helper — EXECUTE is revoked from
      // `authenticated` and it runs inside the SECURITY DEFINER engine; we exercise
      // it through the real decide path below rather than calling it directly.)

      // Start the onboarding workflow (as a company user).
      await actAs(c, approver);
      const inst = (await c.query("select erp_workflow_start('customer_onboarding','customer',$1) as id", [customer])).rows[0].id;
      await resetRole(c);
      const task = (await c.query("select id from erp_workflow_tasks where instance_id=$1 and status='pending' limit 1", [inst])).rows[0].id;

      // A non-holder cannot decide.
      await actAs(c, rep);
      await expect(c.query("select erp_workflow_decide($1,'approve',null)", [task])).rejects.toThrow();
      await resetRole(c);

      // The holder can — instance completes as approved.
      await actAs(c, approver);
      await c.query("select erp_workflow_decide($1,'approve',$2)", [task, null]);
      await resetRole(c);
      const status = (await c.query('select status from erp_workflow_instances where id=$1', [inst])).rows[0].status;
      expect(status).toBe('approved');
    });
  }, 30_000);
});
