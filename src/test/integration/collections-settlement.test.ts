import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs } from '../db';
import { allocatePayment, type OutstandingInvoice } from '@/lib/distribution/collections/allocation';

/**
 * Phase 3 collection-settlement integration tests, against the REAL schema (0192):
 * the pure allocation engine driving multi-invoice settlement persisted into
 * erp_collections / erp_collection_allocations, invoice paid_amount updated, plus
 * tenant isolation on the new tables and the data-integrity constraints
 * (applied_amount > 0, UNIQUE per invoice). Gated on TEST_DATABASE_URL; rollback.
 */

async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('ITEST_COL') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values($1,'C','C') returning id", [company])).rows[0].id;
  const customer = (await c.query("insert into erp_customers(branch_id,code,name) values($1,$2,'Cust') returning id", [branch, `C-${randomUUID().slice(0,8)}`])).rows[0].id;
  return { company, branch, customer };
}

async function addInvoice(c: Client, branch: string, customer: string, net: number, due: string) {
  return (await c.query(
    "insert into erp_invoices(branch_id,customer_id,invoice_number,status,net_amount,paid_amount,due_date) values($1,$2,$3,'issued',$4,0,$5) returning id",
    [branch, customer, `INV-${randomUUID().slice(0,8)}`, net, due],
  )).rows[0].id;
}

describe.skipIf(!hasTestDb)('Phase 3 · collection multi-invoice settlement (end-to-end)', () => {
  it('allocates a collection across invoices and persists receipt + allocations + invoice paid_amount', async () => {
    await withRollback(async (c) => {
      const { branch, customer } = await seed(c);
      const invA = await addInvoice(c, branch, customer, 100, '2026-01-01');
      const invB = await addInvoice(c, branch, customer, 50, '2026-02-01');

      // read outstanding from DB, run the real allocation engine
      const { rows } = await c.query('select id, net_amount, paid_amount, due_date from erp_invoices where customer_id=$1', [customer]);
      const outstanding: OutstandingInvoice[] = rows.map((r) => ({ id: r.id, outstanding: Number(r.net_amount) - Number(r.paid_amount), date: r.due_date.toISOString().slice(0,10) }));
      const result = allocatePayment(120, outstanding);
      expect(result.totalApplied).toBe(120);
      expect(result.unapplied).toBe(0);

      // persist the collection receipt + allocations, apply to invoices
      const col = (await c.query("insert into erp_collections(branch_id,customer_id,amount,method,applied_amount,unapplied_amount,status) values($1,$2,120,'cash',$3,$4,'settled') returning id", [branch, customer, result.totalApplied, result.unapplied])).rows[0].id;
      for (const a of result.allocations) {
        await c.query('insert into erp_collection_allocations(collection_id,invoice_id,applied_amount) values($1,$2,$3)', [col, a.invoiceId, a.applied]);
        await c.query("update erp_invoices set paid_amount = paid_amount + $2, status = (case when paid_amount + $2 >= net_amount then 'paid' else 'partially_paid' end)::erp_invoice_status where id=$1", [a.invoiceId, a.applied]);
      }

      // assertions: A fully paid (100), B partially (20)
      const aRow = (await c.query('select paid_amount, status from erp_invoices where id=$1', [invA])).rows[0];
      const bRow = (await c.query('select paid_amount, status from erp_invoices where id=$1', [invB])).rows[0];
      expect(Number(aRow.paid_amount)).toBe(100);
      expect(aRow.status).toBe('paid');
      expect(Number(bRow.paid_amount)).toBe(20);
      expect(bRow.status).toBe('partially_paid');

      const allocSum = (await c.query('select coalesce(sum(applied_amount),0) s from erp_collection_allocations where collection_id=$1', [col])).rows[0].s;
      expect(Number(allocSum)).toBe(120);
    });
  }, 30_000);

  it('enforces data-integrity constraints (applied_amount > 0; one allocation per invoice)', async () => {
    await withRollback(async (c) => {
      const { branch, customer } = await seed(c);
      const inv = await addInvoice(c, branch, customer, 100, '2026-01-01');
      const col = (await c.query("insert into erp_collections(branch_id,customer_id,amount,method) values($1,$2,100,'cash') returning id", [branch, customer])).rows[0].id;
      // applied_amount must be > 0 (savepoint so the tx survives the expected error)
      await c.query('savepoint sp1');
      await expect(c.query('insert into erp_collection_allocations(collection_id,invoice_id,applied_amount) values($1,$2,0)', [col, inv])).rejects.toThrow();
      await c.query('rollback to savepoint sp1');
      // first valid allocation ok; duplicate (collection,invoice) rejected
      await c.query('insert into erp_collection_allocations(collection_id,invoice_id,applied_amount) values($1,$2,50)', [col, inv]);
      await c.query('savepoint sp2');
      await expect(c.query('insert into erp_collection_allocations(collection_id,invoice_id,applied_amount) values($1,$2,10)', [col, inv])).rejects.toThrow();
      await c.query('rollback to savepoint sp2');
    });
  }, 30_000);

  it('multi-company: collections are tenant-isolated (A cannot see B)', async () => {
    await withRollback(async (c) => {
      const coA = (await c.query("insert into erp_companies(name) values('COL_A') returning id")).rows[0].id;
      const coB = (await c.query("insert into erp_companies(name) values('COL_B') returning id")).rows[0].id;
      const brA = (await c.query("insert into erp_branches(company_id,code,name) values($1,'A','A') returning id", [coA])).rows[0].id;
      const brB = (await c.query("insert into erp_branches(company_id,code,name) values($1,'B','B') returning id", [coB])).rows[0].id;
      const cuA = (await c.query("insert into erp_customers(branch_id,code,name) values($1,$2,'CA') returning id", [brA, `CA-${randomUUID().slice(0,8)}`])).rows[0].id;
      const cuB = (await c.query("insert into erp_customers(branch_id,code,name) values($1,$2,'CB') returning id", [brB, `CB-${randomUUID().slice(0,8)}`])).rows[0].id;
      await c.query("insert into erp_collections(branch_id,customer_id,amount,method) values($1,$2,10,'cash')", [brA, cuA]);
      await c.query("insert into erp_collections(branch_id,customer_id,amount,method) values($1,$2,20,'cash')", [brB, cuB]);
      const userA = randomUUID();
      await c.query('insert into erp_user_branches(user_id,branch_id,is_default) values($1,$2,true)', [userA, brA]);

      await actAs(c, userA);
      const seen = (await c.query('select branch_id, amount from erp_collections')).rows;
      expect(seen.map((r) => r.branch_id)).toEqual([brA]);
      expect(Number(seen[0].amount)).toBe(10);
      // cannot write a collection for branch B
      await expect(c.query("insert into erp_collections(branch_id,customer_id,amount,method) values($1,$2,9,'cash')", [brB, cuB])).rejects.toThrow();
    });
  }, 30_000);
});
