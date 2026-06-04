import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Row-Level-Security integration tests — prove the multi-tenant boundary holds:
 * a user scoped to company A cannot see, or write into, company B's data, while
 * a platform owner sees everything. Exercised against the real RLS policies by
 * switching to the `authenticated` role with a forged `auth.uid()`. Gated on
 * TEST_DATABASE_URL (see src/test/db.ts).
 */

interface Tenants {
  companyA: string; companyB: string;
  userA: string; userB: string;
  svcA: string; svcB: string;
}

async function seedTwoTenants(c: Client): Promise<Tenants> {
  const companyA = (await c.query("insert into erp_companies(name) values('RLS_A') returning id")).rows[0].id;
  const companyB = (await c.query("insert into erp_companies(name) values('RLS_B') returning id")).rows[0].id;
  const branchA = (await c.query("insert into erp_branches(company_id,code,name) values($1,'A','A') returning id", [companyA])).rows[0].id;
  const branchB = (await c.query("insert into erp_branches(company_id,code,name) values($1,'B','B') returning id", [companyB])).rows[0].id;
  const userA = randomUUID();
  const userB = randomUUID();
  await c.query('insert into erp_user_branches(user_id,branch_id,is_default) values($1,$2,true)', [userA, branchA]);
  await c.query('insert into erp_user_branches(user_id,branch_id,is_default) values($1,$2,true)', [userB, branchB]);
  const svcA = (await c.query("insert into erp_clinic_services(company_id,name) values($1,'svcA') returning id", [companyA])).rows[0].id;
  const svcB = (await c.query("insert into erp_clinic_services(company_id,name) values($1,'svcB') returning id", [companyB])).rows[0].id;
  return { companyA, companyB, userA, userB, svcA, svcB };
}

const bothIds = (t: Tenants) => [t.svcA, t.svcB];

describe.skipIf(!hasTestDb)('RLS · tenant isolation', () => {
  it('a user sees only their own company rows', async () => {
    await withRollback(async (c) => {
      const t = await seedTwoTenants(c);

      await actAs(c, t.userA);
      const a = await c.query('select id from erp_clinic_services where id = any($1::uuid[])', [bothIds(t)]);
      expect(a.rows.map((r) => r.id)).toEqual([t.svcA]);
      await resetRole(c);

      await actAs(c, t.userB);
      const b = await c.query('select id from erp_clinic_services where id = any($1::uuid[])', [bothIds(t)]);
      expect(b.rows.map((r) => r.id)).toEqual([t.svcB]);
    });
  }, 30_000);

  it("stamps a tenant's insert with their own company_id", async () => {
    await withRollback(async (c) => {
      const t = await seedTwoTenants(c);
      await actAs(c, t.userA);
      const ins = await c.query("insert into erp_clinic_services(name) values('stamped') returning company_id");
      expect(ins.rows[0].company_id).toBe(t.companyA);
    });
  }, 30_000);

  it('forbids inserting a row for another company', async () => {
    await withRollback(async (c) => {
      const t = await seedTwoTenants(c);
      await actAs(c, t.userA);
      await expect(
        c.query("insert into erp_clinic_services(company_id,name) values($1,'evil')", [t.companyB]),
      ).rejects.toThrow();
    });
  }, 30_000);

  it('forbids updating another company row', async () => {
    await withRollback(async (c) => {
      const t = await seedTwoTenants(c);
      await actAs(c, t.userA);
      const res = await c.query("update erp_clinic_services set name='hijacked' where id=$1", [t.svcB]);
      expect(res.rowCount).toBe(0); // RLS hides B's row, so nothing updates
    });
  }, 30_000);

  it('lets a platform owner see every company', async () => {
    await withRollback(async (c) => {
      const t = await seedTwoTenants(c);
      const owner = randomUUID();
      // Creating the auth user fires the new-user trigger that inserts the
      // profile (and satisfies erp_profiles.id -> auth.users); then mark it.
      await c.query('insert into auth.users(id, email) values ($1, $2)', [owner, `owner+${owner}@test.local`]);
      await c.query('update erp_profiles set is_platform_owner = true where id = $1', [owner]);
      await actAs(c, owner);
      const r = await c.query('select id from erp_clinic_services where id = any($1::uuid[])', [bothIds(t)]);
      expect(r.rows.map((x) => x.id).sort()).toEqual([t.svcA, t.svcB].sort());
    });
  }, 30_000);
});
