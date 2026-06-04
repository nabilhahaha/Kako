import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback } from '../db';

/**
 * 0118 — invoice idempotency (BUG HUNT regression guard).
 *
 * The reported production error — "Could not find the 'idempotency_key' column
 * of 'erp_invoices' in the schema cache" — is what PostgREST emits when the
 * column is absent (a DB that hasn't applied migration 0118). The createInvoice
 * server action ALWAYS includes idempotency_key in its insert payload, so a DB
 * missing the column fails every invoice save. These tests assert, against a
 * properly-migrated DB, that:
 *   (a) erp_invoices.idempotency_key exists (the column the action writes), and
 *   (b) the unique partial index uq_erp_invoices_idem enforces the race backstop
 *       (a duplicate key is rejected), while NULL keys are unconstrained.
 * In any environment where 0118 is applied these pass; in a drifted env they
 * fail loudly — surfacing the schema gap instead of an opaque runtime error.
 */
describe.skipIf(!hasTestDb)('invoice idempotency (0118)', () => {
  it('erp_invoices has the idempotency_key column the createInvoice action writes', async () => {
    await withRollback(async (c: Client) => {
      const { rows } = await c.query(
        `select data_type from information_schema.columns
         where table_name = 'erp_invoices' and column_name = 'idempotency_key'`,
      );
      expect(rows.length).toBe(1);
      expect(rows[0].data_type).toBe('uuid');
    });
  });

  it('duplicate idempotency_key is rejected; NULL keys are unconstrained', async () => {
    await withRollback(async (c: Client) => {
      const company = (await c.query("insert into erp_companies(name) values ('IDEM') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const cust = (await c.query("insert into erp_customers(company_id,code,name) values ($1,'C1','C1') returning id", [company])).rows[0].id;
      const key = randomUUID();
      const mkInvoice = (num: string, k: string | null) =>
        c.query(
          "insert into erp_invoices(branch_id,customer_id,invoice_number,status,net_amount,paid_amount,idempotency_key) values ($1,$2,$3,'draft',100,0,$4)",
          [branch, cust, num, k],
        );

      await mkInvoice('INV-1', key);
      // A retry that reuses the SAME key must be rejected by uq_erp_invoices_idem.
      await expect(mkInvoice('INV-2', key)).rejects.toThrow(/duplicate key|unique/i);

      // Two NULL-key invoices must both succeed (partial index excludes NULLs) —
      // proves the column is additive and doesn't constrain ordinary inserts.
      await mkInvoice('INV-3', null);
      await mkInvoice('INV-4', null);
      const n = (await c.query('select count(*)::int n from erp_invoices where branch_id=$1', [branch])).rows[0].n;
      expect(n).toBe(3); // INV-1, INV-3, INV-4 (INV-2 was rejected)
    });
  }, 30_000);
});
