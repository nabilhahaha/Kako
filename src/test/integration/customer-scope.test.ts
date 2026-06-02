import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FMCG hierarchy S4a — customer visibility scope (migration 0104).
 *
 * Proves the scoped RLS: a Sales Rep sees only their own customers, a Regional
 * Manager sees customers in their region (own or via the branch's region), while
 * company-wide roles (admin, and non-sales roles like warehouse_keeper) still see
 * every company customer — zero regression. Exercised through the real policy via
 * `actAs` (forged auth.uid() on the `authenticated` role). Gated on TEST_DATABASE_URL.
 */

/** Create an auth user (fires the profile trigger) so it can own regions / be a
 *  salesman FK target. Returns the id. */
async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1, $2)', [id, `u+${id}@test.local`]);
  return id;
}

async function assign(c: Client, userId: string, branchId: string, role: string): Promise<void> {
  await c.query(
    'insert into erp_user_branches(user_id, branch_id, role, is_default) values ($1,$2,$3,true)',
    [userId, branchId, role],
  );
}

async function mkCustomer(
  c: Client, companyId: string, code: string,
  cols: { branch_id?: string; region_id?: string; salesman_id?: string } = {},
): Promise<string> {
  const { rows } = await c.query(
    `insert into erp_customers(company_id, code, name, branch_id, region_id, salesman_id)
     values ($1,$2,$2,$3,$4,$5) returning id`,
    [companyId, code, cols.branch_id ?? null, cols.region_id ?? null, cols.salesman_id ?? null],
  );
  return rows[0].id;
}

async function visible(c: Client, ids: string[]): Promise<string[]> {
  const r = await c.query('select id from erp_customers where id = any($1::uuid[])', [ids]);
  return r.rows.map((x) => x.id).sort();
}

describe.skipIf(!hasTestDb)('S4a · customer hierarchy scope', () => {
  it('rep sees own; regional sees region; admin/non-sales see all', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('S4_SCOPE') returning id")).rows[0].id;
      const region = (await c.query('insert into erp_regions(company_id, name) values ($1,$2) returning id', [company, 'RG'])).rows[0].id;
      const branchR = (await c.query('insert into erp_branches(company_id, code, name, region_id) values ($1,$2,$2,$3) returning id', [company, 'BR', region])).rows[0].id;
      const branchO = (await c.query('insert into erp_branches(company_id, code, name) values ($1,$2,$2) returning id', [company, 'BO'])).rows[0].id;

      const admin = await mkUser(c);
      const warehouse = await mkUser(c);
      const rm = await mkUser(c);
      const rep = await mkUser(c);
      await assign(c, admin, branchR, 'admin');
      await assign(c, warehouse, branchR, 'warehouse_keeper');
      await assign(c, rm, branchR, 'regional_manager');
      await assign(c, rep, branchR, 'salesman');
      // The regional manager owns the region.
      await c.query('update erp_regions set manager_id = $1 where id = $2', [rm, region]);

      const custRegion = await mkCustomer(c, company, 'C-REGION', { branch_id: branchR, region_id: region });
      const custOtherRegion = await mkCustomer(c, company, 'C-OTHERREG', { branch_id: branchO });
      const custRep = await mkCustomer(c, company, 'C-REP', { branch_id: branchR, salesman_id: rep });
      const custOther = await mkCustomer(c, company, 'C-OTHER', { branch_id: branchO });
      const all = [custRegion, custOtherRegion, custRep, custOther].sort();

      // Company-wide: admin + a non-sales role both see everything (zero regression).
      await actAs(c, admin);
      expect(await visible(c, all)).toEqual(all);
      await resetRole(c);

      await actAs(c, warehouse);
      expect(await visible(c, all)).toEqual(all);
      await resetRole(c);

      // Regional Manager: customers in RG — its own region match (custRegion) and
      // via the branch's region (custRep on branchR→RG). Not branchO customers.
      await actAs(c, rm);
      expect(await visible(c, all)).toEqual([custRegion, custRep].sort());
      await resetRole(c);

      // Sales Rep: only their assigned customer.
      await actAs(c, rep);
      expect(await visible(c, all)).toEqual([custRep]);
    });
  }, 30_000);

  it('S4b · invoices: company-wide keeps branch scope; rep narrows to own customers', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('S4B_TXN') returning id")).rows[0].id;
      const branchR = (await c.query("insert into erp_branches(company_id, code, name) values ($1,'BR','BR') returning id", [company])).rows[0].id;
      const branchO = (await c.query("insert into erp_branches(company_id, code, name) values ($1,'BO','BO') returning id", [company])).rows[0].id;

      const admin = await mkUser(c);
      const rep = await mkUser(c);
      await assign(c, admin, branchR, 'admin');     // company-wide, assigned to branchR only
      await assign(c, rep, branchR, 'salesman');     // scoped

      const custRep = await mkCustomer(c, company, 'IC-REP', { branch_id: branchR, salesman_id: rep });
      const custMate = await mkCustomer(c, company, 'IC-MATE', { branch_id: branchR }); // same branch, not rep's
      const custO = await mkCustomer(c, company, 'IC-O', { branch_id: branchO });

      const mkInv = async (branch: string, customer: string, no: string) =>
        (await c.query('insert into erp_invoices(branch_id, customer_id, invoice_number) values ($1,$2,$3) returning id', [branch, customer, no])).rows[0].id;
      const invRep = await mkInv(branchR, custRep, 'INV-REP');
      const invMate = await mkInv(branchR, custMate, 'INV-MATE');
      const invOther = await mkInv(branchO, custO, 'INV-OTHER');
      const allInv = [invRep, invMate, invOther];
      const visInv = async () =>
        (await c.query('select id from erp_invoices where id = any($1::uuid[])', [allInv])).rows.map((r) => r.id).sort();

      // Admin (company-wide) keeps today's branch scope: sees branchR invoices, not branchO.
      await actAs(c, admin);
      expect(await visInv()).toEqual([invRep, invMate].sort());
      await resetRole(c);

      // Rep narrows to their own customer's invoice — NOT the same-branch mate's.
      await actAs(c, rep);
      expect(await visInv()).toEqual([invRep]);
    });
  }, 30_000);
});
