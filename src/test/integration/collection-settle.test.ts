import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * 0267 — erp_settle_collection: atomic multi-invoice collection settlement.
 *
 * Covers the Phase 5 requirements against a real Postgres, each in a rolled-back
 * transaction: oldest-first + specified allocation, settlement (collection +
 * allocations + invoice paid/status), COL- numbering, idempotency, tenant
 * isolation, and customer-balance consistency. SECURITY DEFINER reads auth.uid(),
 * so we actAs(rep). Gated on TEST_DATABASE_URL.
 */

interface Seed { company: string; branch: string; rep: string; customer: string }

async function seed(c: Client, opts: { balance?: number } = {}): Promise<Seed> {
  const company = (await c.query("insert into erp_companies(name) values('VCOL') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const rep = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [rep, `r+${rep}@test.local`]);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [rep, branch, 'salesman']);
  const customer = (await c.query("insert into erp_customers(company_id,code,name,is_approved,balance) values ($1,$2,'C',true,$3) returning id", [company, `C-${randomUUID().slice(0, 6)}`, opts.balance ?? 0])).rows[0].id;
  return { company, branch, rep, customer };
}

async function mkInvoice(c: Client, s: Seed, net: number, due: string): Promise<string> {
  return (await c.query(
    "insert into erp_invoices(branch_id,customer_id,invoice_number,status,net_amount,paid_amount,due_date) values ($1,$2,$3,'issued',$4,0,$5) returning id",
    [s.branch, s.customer, `INV-${randomUUID().slice(0, 8)}`, net, due],
  )).rows[0].id;
}

async function settle(c: Client, s: Seed, amount: number, opts: { specified?: object | null; key?: string | null; branch?: string } = {}) {
  const { rows } = await c.query(
    "select * from erp_settle_collection($1,$2,$3,'cash',null,$4::jsonb,$5,null)",
    [opts.branch ?? s.branch, s.customer, amount, opts.specified ? JSON.stringify(opts.specified) : null, opts.key ?? null],
  );
  return rows[0] as { collection_id: string; collection_number: string; total_applied: string; unapplied: string };
}

describe.skipIf(!hasTestDb)('collections · erp_settle_collection (0267)', () => {
  it('oldest-first: settles across invoices, sets paid/partial status, numbers COL-, lowers balance', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { balance: 200 });
      const older = await mkInvoice(c, s, 100, '2026-01-01');
      const newer = await mkInvoice(c, s, 100, '2026-02-01');
      await actAs(c, s.rep);
      const res = await settle(c, s, 150);
      await resetRole(c);

      expect(res.collection_number).toMatch(/^COL-/);
      expect(Number(res.total_applied)).toBe(150);
      expect(Number(res.unapplied)).toBe(0);

      // Oldest fully paid, newer partially paid.
      const io = (await c.query('select paid_amount, status from erp_invoices where id=$1', [older])).rows[0];
      const inw = (await c.query('select paid_amount, status from erp_invoices where id=$1', [newer])).rows[0];
      expect(Number(io.paid_amount)).toBe(100); expect(io.status).toBe('paid');
      expect(Number(inw.paid_amount)).toBe(50); expect(inw.status).toBe('partially_paid');

      // Two allocation rows; header totals; balance 200 → 50.
      const allocs = (await c.query('select count(*)::int n, sum(applied_amount) s from erp_collection_allocations where collection_id=$1', [res.collection_id])).rows[0];
      expect(allocs.n).toBe(2); expect(Number(allocs.s)).toBe(150);
      const col = (await c.query('select applied_amount, unapplied_amount, status from erp_collections where id=$1', [res.collection_id])).rows[0];
      expect(Number(col.applied_amount)).toBe(150); expect(col.status).toBe('settled');
      const bal = (await c.query('select balance from erp_customers where id=$1', [s.customer])).rows[0].balance;
      expect(Number(bal)).toBe(50);
    });
  }, 30_000);

  it('specified: applies only to the named invoice(s), clamped to remaining + budget', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { balance: 200 });
      const a = await mkInvoice(c, s, 100, '2026-01-01');
      const b = await mkInvoice(c, s, 100, '2026-02-01');
      await actAs(c, s.rep);
      const res = await settle(c, s, 100, { specified: { [b]: 100 } });
      await resetRole(c);

      expect(Number(res.total_applied)).toBe(100);
      const ia = (await c.query('select paid_amount, status from erp_invoices where id=$1', [a])).rows[0];
      const ib = (await c.query('select paid_amount, status from erp_invoices where id=$1', [b])).rows[0];
      expect(Number(ia.paid_amount)).toBe(0);        // untouched
      expect(Number(ib.paid_amount)).toBe(100);      // fully paid
      expect(ib.status).toBe('paid');
    });
  }, 30_000);

  it('overpayment: applies up to outstanding, records the remainder as unapplied (balance not over-reduced)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { balance: 200 });
      await mkInvoice(c, s, 100, '2026-01-01');
      await mkInvoice(c, s, 100, '2026-02-01');
      await actAs(c, s.rep);
      const res = await settle(c, s, 250);
      await resetRole(c);
      expect(Number(res.total_applied)).toBe(200);
      expect(Number(res.unapplied)).toBe(50);
      const bal = (await c.query('select balance from erp_customers where id=$1', [s.customer])).rows[0].balance;
      expect(Number(bal)).toBe(0); // reduced by APPLIED (200), not by the 250 received
    });
  }, 30_000);

  it('is idempotent: a repeat key returns the same receipt and applies once', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { balance: 100 });
      const inv = await mkInvoice(c, s, 100, '2026-01-01');
      const key = randomUUID();
      await actAs(c, s.rep);
      const a = await settle(c, s, 100, { key });
      const b = await settle(c, s, 100, { key });
      await resetRole(c);
      expect(b.collection_id).toBe(a.collection_id);
      const n = (await c.query('select count(*)::int n from erp_collections where idempotency_key=$1', [key])).rows[0].n;
      expect(n).toBe(1);
      // Applied once: invoice paid 100 (not 200-capped), balance 100 → 0.
      const iv = (await c.query('select paid_amount from erp_invoices where id=$1', [inv])).rows[0];
      expect(Number(iv.paid_amount)).toBe(100);
      const bal = (await c.query('select balance from erp_customers where id=$1', [s.customer])).rows[0].balance;
      expect(Number(bal)).toBe(0);
    });
  }, 30_000);

  it('rejects a non-positive amount', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.rep);
      await c.query('savepoint a');
      await expect(settle(c, s, 0)).rejects.toThrow(/invalid_amount/);
      await c.query('rollback to savepoint a');
      await resetRole(c);
    });
  }, 30_000);

  it('tenant isolation: a rep cannot settle against a branch they do not belong to', async () => {
    await withRollback(async (c) => {
      const a = await seed(c, { balance: 100 });
      const b = await seed(c, { balance: 100 });
      await actAs(c, b.rep);
      await c.query('savepoint a');
      await expect(settle(c, a, 100, { branch: a.branch })).rejects.toThrow(/branch_access_denied/);
      await c.query('rollback to savepoint a');
      await resetRole(c);
    });
  }, 30_000);
});
