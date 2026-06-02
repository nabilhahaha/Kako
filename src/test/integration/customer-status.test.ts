import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FP-CS Customer Status Blocking (0113) — DB-authoritative gates.
 * Proves: blocked/suspended customers reject NEW orders & invoices; payments and
 * sales returns ALWAYS post (debt + stock recovery); blocked customers reject
 * rep assignment while suspended ones allow it; and status changes are stamped.
 * Gated on TEST_DATABASE_URL.
 */

async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [id, `u+${id}@test.local`]);
  return id;
}

async function seedCompany(c: Client): Promise<{ company: string; user: string; branch: string }> {
  const company = (await c.query('insert into erp_companies(name) values ($1) returning id', ['CS_CO'])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = await mkUser(c);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, 'admin']);
  return { company, user, branch };
}

const addCustomer = async (c: Client): Promise<string> =>
  (await c.query('insert into erp_customers(code,name) values ($1,$1) returning id', [`C-${randomUUID().slice(0, 8)}`])).rows[0].id;

const setStatus = (c: Client, id: string, s: string) =>
  c.query('update erp_customers set customer_status = $2 where id = $1', [id, s]);

const insertOrder = (c: Client, branch: string, cust: string) =>
  c.query("insert into erp_sales_orders(branch_id,customer_id,order_number,status) values ($1,$2,$3,'draft') returning id", [branch, cust, `SO-${randomUUID().slice(0, 8)}`]);

const insertInvoice = (c: Client, branch: string, cust: string) =>
  c.query("insert into erp_invoices(branch_id,customer_id,invoice_number,status) values ($1,$2,$3,'draft') returning id", [branch, cust, `INV-${randomUUID().slice(0, 8)}`]);

const insertReturn = (c: Client, branch: string, cust: string) =>
  c.query('insert into erp_sales_returns(branch_id,customer_id,return_number) values ($1,$2,$3) returning id', [branch, cust, `RET-${randomUUID().slice(0, 8)}`]);

/** Run an expected-to-fail statement in a savepoint (the gate RAISEs). */
async function expectRaise(c: Client, run: () => Promise<unknown>): Promise<boolean> {
  await c.query('savepoint sp');
  try { await run(); await c.query('release savepoint sp'); return false; }
  catch { await c.query('rollback to savepoint sp'); return true; }
}

describe.skipIf(!hasTestDb)('customer status blocking · gates', () => {
  it('blocks new business, always allows recovery, stamps changes', async () => {
    await withRollback(async (c) => {
      const A = await seedCompany(c);
      await actAs(c, A.user);
      const cust = await addCustomer(c);

      // Active: an invoice (used later for a payment) and an order both succeed.
      const inv = (await insertInvoice(c, A.branch, cust)).rows[0].id;
      await (await insertOrder(c, A.branch, cust));

      // ── BLOCKED ──────────────────────────────────────────────────────────
      await setStatus(c, cust, 'blocked');
      expect(await expectRaise(c, () => insertOrder(c, A.branch, cust))).toBe(true);   // no new order
      expect(await expectRaise(c, () => insertInvoice(c, A.branch, cust))).toBe(true); // no new invoice
      expect(await expectRaise(c, () => c.query('update erp_customers set salesman_id = $2 where id = $1', [cust, A.user]))).toBe(true); // no rep assign

      // Recovery ALWAYS allowed even when blocked: payment + sales return.
      await c.query('insert into erp_payments(invoice_id, amount) values ($1, $2)', [inv, 10]);
      await insertReturn(c, A.branch, cust);

      // Status change was stamped (who/when).
      const st = (await c.query('select status_changed_at, status_changed_by from erp_customers where id=$1', [cust])).rows[0];
      expect(st.status_changed_at).not.toBeNull();
      expect(st.status_changed_by).toBe(A.user);

      // ── SUSPENDED ────────────────────────────────────────────────────────
      await setStatus(c, cust, 'suspended');
      expect(await expectRaise(c, () => insertOrder(c, A.branch, cust))).toBe(true);   // still no new order
      // …but rep assignment is allowed when only suspended.
      await c.query('update erp_customers set salesman_id = $2 where id = $1', [cust, A.user]);

      // ── BACK TO ACTIVE clears the reason ─────────────────────────────────
      await c.query("update erp_customers set customer_status='suspended', status_reason_note='x' where id=$1", [cust]);
      await c.query("update erp_customers set customer_status='active' where id=$1", [cust]);
      const back = (await c.query('select status_reason_note from erp_customers where id=$1', [cust])).rows[0];
      expect(back.status_reason_note).toBeNull();
      await (await insertOrder(c, A.branch, cust)); // active again → order succeeds
      await resetRole(c);
    });
  }, 30_000);
});
