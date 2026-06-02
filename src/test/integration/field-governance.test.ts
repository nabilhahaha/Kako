import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * DFG-1 Field Governance (0114) — tenant isolation + admin-only writes.
 * Proves company A can't see company B's field config/access, and that a
 * non-admin can't write governance rows while an admin can. Resolver logic is
 * unit-tested in field-governance.test.ts. Gated on TEST_DATABASE_URL.
 */

async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [id, `u+${id}@test.local`]);
  return id;
}

async function seedCompany(c: Client, name: string, role: string): Promise<{ company: string; user: string }> {
  const company = (await c.query('insert into erp_companies(name) values ($1) returning id', [name])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = await mkUser(c);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, role]);
  return { company, user };
}

async function expectRaise(c: Client, run: () => Promise<unknown>): Promise<boolean> {
  await c.query('savepoint sp');
  try { await run(); await c.query('release savepoint sp'); return false; }
  catch { await c.query('rollback to savepoint sp'); return true; }
}

const insertConfig = (c: Client, entity: string, field: string, access: string) =>
  c.query(
    "insert into erp_field_config(entity, field_key, source, default_access) values ($1,$2,'core',$3) returning id",
    [entity, field, access],
  );

describe.skipIf(!hasTestDb)('field governance · RLS + admin writes', () => {
  it('tenant isolation + admin-only write', async () => {
    await withRollback(async (c) => {
      const A = await seedCompany(c, 'FG_A', 'admin');
      const B = await seedCompany(c, 'FG_B', 'admin');
      const Rep = await mkUser(c);
      // a non-admin (salesman) member of company A
      const aBranch = (await c.query("select id from erp_branches where company_id=$1", [A.company])).rows[0].id;
      await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [Rep, aBranch, 'salesman']);

      // Admin A writes a config row.
      await actAs(c, A.user);
      const cfgId = (await insertConfig(c, 'customer', 'credit_limit', 'view')).rows[0].id;
      await resetRole(c);

      // Company B's admin cannot see A's row (tenant isolation).
      await actAs(c, B.user);
      expect((await c.query('select id from erp_field_config where id=$1', [cfgId])).rows.length).toBe(0);
      await resetRole(c);

      // Non-admin (salesman) in A cannot write governance rows (RLS write policy).
      await actAs(c, Rep);
      expect(await expectRaise(c, () => insertConfig(c, 'customer', 'tax_number', 'hidden'))).toBe(true);
      // …but can READ the company's config (forms need the layout).
      expect((await c.query('select id from erp_field_config where id=$1', [cfgId])).rows.length).toBe(1);
      await resetRole(c);

      // Sections (0115): admin writes; tenant-isolated.
      await actAs(c, A.user);
      const secId = (await c.query(
        "insert into erp_field_sections(entity, key, label_en, icon, collapsible) values ('customer','commercial','Commercial','Briefcase',true) returning id",
      )).rows[0].id;
      await resetRole(c);
      await actAs(c, B.user);
      expect((await c.query('select id from erp_field_sections where id=$1', [secId])).rows.length).toBe(0);
      await resetRole(c);

      // Versions (0117): one-published invariant + tenant isolation.
      await actAs(c, A.user);
      await c.query("insert into erp_field_config_versions(entity, version_no, status, snapshot) values ('customer',1,'published','{}'::jsonb)");
      // a second 'published' for the same (company, entity) violates the partial unique
      await c.query('savepoint sp2');
      let dupFailed = false;
      try { await c.query("insert into erp_field_config_versions(entity, version_no, status, snapshot) values ('customer',2,'published','{}'::jsonb)"); }
      catch { dupFailed = true; await c.query('rollback to savepoint sp2'); }
      expect(dupFailed).toBe(true);
      await resetRole(c);
      // B can't see A's versions.
      await actAs(c, B.user);
      expect((await c.query("select id from erp_field_config_versions where entity='customer'")).rows.length).toBe(0);
      await resetRole(c);
    });
  }, 30_000);
});
