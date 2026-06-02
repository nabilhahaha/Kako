import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * 0118 — payment idempotency. A retry with the same idempotency_key must NOT
 * create a second payment or double-decrement the customer balance.
 */

async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [id, `u+${id}@test.local`]);
  return id;
}

describe.skipIf(!hasTestDb)('payment idempotency (0118)', () => {
  it('same idempotency_key → one payment, balance decremented once', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values ('PAY') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = await mkUser(c);
      await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, 'admin']);
      const cust = (await c.query("insert into erp_customers(company_id,code,name,balance) values ($1,'C1','C1',100) returning id", [company])).rows[0].id;
      const inv = (await c.query(
        "insert into erp_invoices(branch_id,customer_id,invoice_number,status,net_amount,paid_amount) values ($1,$2,'INV-1','issued',100,0) returning id",
        [branch, cust],
      )).rows[0].id;

      await actAs(c, user);
      const key = randomUUID();
      const pay = () => c.query('select erp_record_payment($1::uuid,$2::numeric,$3::erp_payment_method,$4,$5::date,$6::uuid)',
        [inv, 50, 'cash', null, '2026-06-02', key]);
      await pay();
      await pay(); // retry with the SAME key — must be a no-op
      await resetRole(c);

      const payments = (await c.query('select count(*)::int n, coalesce(sum(amount),0)::numeric s from erp_payments where invoice_id=$1', [inv])).rows[0];
      expect(payments.n).toBe(1);              // exactly one payment row
      expect(Number(payments.s)).toBe(50);     // amount once
      const bal = (await c.query('select balance from erp_customers where id=$1', [cust])).rows[0].balance;
      expect(Number(bal)).toBe(50);            // 100 - 50 once (not -100)
    });
  }, 30_000);
});
