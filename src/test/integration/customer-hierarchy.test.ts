import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FP-0 Customer Hierarchy (0112) — helpers + guard trigger + tenant isolation.
 * Proves the recursive ancestors/descendants/head_office helpers, the single-
 * level + same-company guard, and that the helpers stay within the caller's
 * company. Gated on TEST_DATABASE_URL.
 */

async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [id, `u+${id}@test.local`]);
  return id;
}

async function seedCompany(c: Client, name: string): Promise<{ company: string; user: string }> {
  const company = (await c.query('insert into erp_companies(name) values ($1) returning id', [name])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = await mkUser(c);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, 'admin']);
  return { company, user };
}

/** Insert a customer as the current role (company_id is set by the trigger). */
async function addCustomer(
  c: Client,
  code: string,
  opts: { accountType?: string; parent?: string | null } = {},
): Promise<string> {
  const r = await c.query(
    `insert into erp_customers(code, name, customer_account_type, parent_customer_id)
     values ($1,$2,$3,$4) returning id`,
    [code, code, opts.accountType ?? 'independent', opts.parent ?? null],
  );
  return r.rows[0].id;
}

const ids = async (c: Client, fn: string, arg: string) =>
  (await c.query(`select id from ${fn}($1::uuid) order by id`, [arg])).rows.map((x) => x.id).sort();

/** Run an expected-to-fail statement inside a savepoint so the surrounding
 *  transaction isn't poisoned (the guard RAISEs abort the statement). */
async function expectRaise(c: Client, run: () => Promise<unknown>): Promise<boolean> {
  await c.query('savepoint sp');
  try {
    await run();
    await c.query('release savepoint sp');
    return false; // did NOT raise
  } catch {
    await c.query('rollback to savepoint sp');
    return true; // raised as expected
  }
}

describe.skipIf(!hasTestDb)('customer hierarchy · helpers + guard', () => {
  it('ancestors/descendants/head_office + guards + isolation', async () => {
    await withRollback(async (c) => {
      const A = await seedCompany(c, 'HIER_A');
      const B = await seedCompany(c, 'HIER_B');

      await actAs(c, A.user);
      const ho = await addCustomer(c, 'A-HO', { accountType: 'head_office' });
      const br1 = await addCustomer(c, 'A-BR1', { accountType: 'branch', parent: ho });
      const br2 = await addCustomer(c, 'A-BR2', { accountType: 'branch', parent: ho });

      // descendants(HO) = {HO, br1, br2}; ancestors(br1) = {br1, HO}.
      expect(await ids(c, 'erp_customer_descendants', ho)).toEqual([ho, br1, br2].sort());
      expect(await ids(c, 'erp_customer_ancestors', br1)).toEqual([br1, ho].sort());
      // head_office(branch) = HO; head_office(HO) = HO.
      expect((await c.query('select erp_customer_head_office($1::uuid) as ho', [br1])).rows[0].ho).toBe(ho);
      expect((await c.query('select erp_customer_head_office($1::uuid) as ho', [ho])).rows[0].ho).toBe(ho);

      // Guard: self-parent rejected.
      expect(await expectRaise(c, () => c.query('update erp_customers set parent_customer_id = id where id = $1', [ho]))).toBe(true);
      // Guard: multi-level (branch-of-branch) rejected.
      expect(await expectRaise(c, () => addCustomer(c, 'A-BR3', { accountType: 'branch', parent: br1 }))).toBe(true);
      await resetRole(c);

      // Guard / RLS: B cannot parent onto A's head office (not visible → rejected).
      await actAs(c, B.user);
      expect(await expectRaise(c, () => addCustomer(c, 'B-BR', { accountType: 'branch', parent: ho }))).toBe(true);
      // Isolation: B sees nothing under A's head office.
      expect(await ids(c, 'erp_customer_descendants', ho)).toEqual([]);
      await resetRole(c);
    });
  }, 30_000);
});
