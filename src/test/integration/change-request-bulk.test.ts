import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Change Request engine — Phase 7: bulk requests. One request, many targets, a
 * SHARED patch (target_id NULL). The apply engine fans out per target with
 * per-target status + before/after audit and is partial-failure tolerant.
 * Gated on TEST_DATABASE_URL.
 */
async function seedTenant(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('CRB') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'admin',true)", [user, branch]);
  return { company, user };
}
async function customer(c: Client, company: string, credit: number) {
  return (await c.query("insert into erp_customers(company_id,code,name,credit_limit) values ($1,$2,'C',$3) returning id", [company, `C-${randomUUID().slice(0, 6)}`, credit])).rows[0].id;
}

describe.skipIf(!hasTestDb)('change-requests · bulk', () => {
  it('applies one shared patch across many customers', async () => {
    await withRollback(async (c) => {
      const { company, user } = await seedTenant(c);
      const a = await customer(c, company, 100);
      const b = await customer(c, company, 150);
      const d = await customer(c, company, 200);

      await actAs(c, user);
      const cr = (await c.query("insert into erp_change_requests(entity_key,scope,status,requested_by) values ('customer','bulk','approved',$1) returning id", [user])).rows[0].id;
      for (const t of [a, b, d]) await c.query('insert into erp_change_request_targets(request_id,target_id) values ($1,$2)', [cr, t]);
      // shared value: target_id NULL → applies to every target
      await c.query("insert into erp_change_request_values(request_id,target_id,field_key,new_value) values ($1,null,'credit_limit','500'::jsonb)", [cr]);
      await resetRole(c);

      expect((await c.query('select erp_change_request_apply($1) as s', [cr])).rows[0].s).toBe('applied');
      for (const t of [a, b, d]) {
        expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [t])).rows[0].credit_limit)).toBe(500);
      }
      expect((await c.query("select count(*)::int n from erp_change_request_targets where request_id=$1 and status='applied'", [cr])).rows[0].n).toBe(3);
    });
  }, 30_000);

  it('is partial-failure tolerant (bad target → partially_applied)', async () => {
    await withRollback(async (c) => {
      const { company, user } = await seedTenant(c);
      const a = await customer(c, company, 100);

      await actAs(c, user);
      const cr = (await c.query("insert into erp_change_requests(entity_key,scope,status,requested_by) values ('customer','bulk','approved',$1) returning id", [user])).rows[0].id;
      await c.query('insert into erp_change_request_targets(request_id,target_id) values ($1,$2)', [cr, a]);
      await c.query("insert into erp_change_request_targets(request_id,target_id) values ($1,$2)", [cr, randomUUID()]); // nonexistent
      await c.query("insert into erp_change_request_values(request_id,target_id,field_key,new_value) values ($1,null,'credit_limit','777'::jsonb)", [cr]);
      await resetRole(c);

      expect((await c.query('select erp_change_request_apply($1) as s', [cr])).rows[0].s).toBe('partially_applied');
      expect(Number((await c.query('select credit_limit from erp_customers where id=$1', [a])).rows[0].credit_limit)).toBe(777);
      expect((await c.query("select count(*)::int n from erp_change_request_targets where request_id=$1 and status='applied'", [cr])).rows[0].n).toBe(1);
      expect((await c.query("select error from erp_change_request_targets where request_id=$1 and status='failed'", [cr])).rows[0].error).toBe('target_not_found');
    });
  }, 30_000);
});
