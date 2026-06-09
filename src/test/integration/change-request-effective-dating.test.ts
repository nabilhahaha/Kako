import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Change Request engine — Phase 6: effective dating via the due-sweep (0257).
 * A future-dated approved request is parked as `scheduled` and applied only once
 * its effective date arrives; the sweep drives both. Gated on TEST_DATABASE_URL.
 */
async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('CRED') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);
  const customer = (await c.query("insert into erp_customers(company_id,code,name,credit_limit) values ($1,$2,'A',100) returning id", [company, `C-${randomUUID().slice(0, 6)}`])).rows[0].id;
  return { company, user, customer };
}

describe.skipIf(!hasTestDb)('change-requests · effective dating', () => {
  it('future-dated request parks as scheduled, then applies when due', async () => {
    await withRollback(async (c) => {
      const { user, customer } = await seed(c);
      await actAs(c, user);
      const cr = (await c.query(
        "insert into erp_change_requests(entity_key,scope,status,requested_by,effective_at) values ('customer','single','approved',$1, now() + interval '30 days') returning id",
        [user],
      )).rows[0].id;
      await c.query('insert into erp_change_request_targets(request_id,target_id) values ($1,$2)', [cr, customer]);
      await c.query("insert into erp_change_request_values(request_id,target_id,field_key,new_value) values ($1,$2,'credit_limit','999'::jsonb)", [cr, customer]);
      await resetRole(c);

      // First sweep: not due → parked as scheduled, nothing applied.
      const applied1 = (await c.query('select erp_change_request_run_due() as n')).rows[0].n;
      expect(Number(applied1)).toBe(0);
      expect((await c.query('select status from erp_change_requests where id=$1', [cr])).rows[0].status).toBe('scheduled');
      expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [customer])).rows[0].credit_limit)).toBe(100);

      // Time arrives → the sweep applies it.
      await c.query("update erp_change_requests set effective_at = now() - interval '1 minute' where id=$1", [cr]);
      const applied2 = (await c.query('select erp_change_request_run_due() as n')).rows[0].n;
      expect(Number(applied2)).toBeGreaterThanOrEqual(1);
      expect((await c.query('select status from erp_change_requests where id=$1', [cr])).rows[0].status).toBe('applied');
      expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [customer])).rows[0].credit_limit)).toBe(999);
    });
  }, 30_000);
});
