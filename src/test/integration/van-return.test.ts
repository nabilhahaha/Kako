import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * 0266 — erp_van_return: the atomic field return back to the rep's van.
 *
 * Covers the Phase 3 requirements against a real Postgres, each in a rolled-back
 * transaction: return-to-van (not branch), credit-note linkage + traceability,
 * stock reconciliation (van qty up, customer balance down), mandatory reason,
 * invoice-priced server authority, idempotency, tenant isolation, no-van.
 * SECURITY DEFINER reads auth.uid(), so we actAs(rep). Gated on TEST_DATABASE_URL.
 */

interface Seed {
  company: string; branch: string; rep: string; van: string;
  product: string; customer: string; reason: string;
}

async function seed(c: Client, opts: { sellPrice?: number; vanStock?: number; balance?: number; assignVan?: boolean } = {}): Promise<Seed> {
  const sfx = randomUUID().slice(0, 8);
  const company = (await c.query("insert into erp_companies(name) values('VRET') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const rep = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [rep, `r+${rep}@test.local`]);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [rep, branch, 'salesman']);

  let van = '';
  if (opts.assignVan !== false) {
    van = (await c.query("insert into erp_warehouses(branch_id,code,name,is_van,assigned_to) values ($1,$2,'Van',true,$3) returning id", [branch, `VAN-${sfx}`, rep])).rows[0].id;
  }
  const product = (await c.query("insert into erp_products_catalog(company_id,code,name,sell_price) values ($1,$2,'P',$3) returning id", [company, `P-${sfx}`, opts.sellPrice ?? 100])).rows[0].id;
  if (van && opts.vanStock !== undefined) {
    await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,$3)', [van, product, opts.vanStock]);
  }
  const customer = (await c.query("insert into erp_customers(company_id,code,name,is_approved,balance) values ($1,$2,'C',true,$3) returning id", [company, `C-${sfx}`, opts.balance ?? 0])).rows[0].id;
  const reason = (await c.query("insert into erp_return_reasons(company_id,code,label_en,label_ar) values ($1,'damaged','Damaged','تالف') returning id", [company])).rows[0].id;
  return { company, branch, rep, van, product, customer, reason };
}

async function vanReturn(c: Client, s: Seed, lines: object[], opts: { reasonId?: string | null; invoiceId?: string | null; creditNote?: boolean; key?: string | null; branch?: string } = {}) {
  const { rows } = await c.query(
    'select * from erp_van_return($1,$2,$3::jsonb,$4,$5,$6,null,$7)',
    [opts.branch ?? s.branch, s.customer, JSON.stringify(lines), opts.reasonId === undefined ? s.reason : opts.reasonId, opts.invoiceId ?? null, opts.creditNote ?? false, opts.key ?? null],
  );
  return rows[0] as { return_id: string; return_number: string; credit_note_id: string | null; total_amount: string };
}

describe.skipIf(!hasTestDb)('van-return · erp_van_return (0266)', () => {
  it('return-to-van + stock reconciliation: restocks the van (not branch), lowers the balance', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 5, balance: 1000 });
      // A branch (non-van) warehouse exists too — to prove we do NOT restock it.
      const branchWh = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,'WH','WH') returning id", [s.branch])).rows[0].id;
      await actAs(c, s.rep);
      const res = await vanReturn(c, s, [{ product_id: s.product, quantity: 2 }]);
      await resetRole(c);

      expect(res.return_number).toMatch(/RET|RTN|RT/i);
      expect(Number(res.total_amount)).toBe(200);

      const ret = (await c.query('select status, reason_id, created_by from erp_sales_returns where id=$1', [res.return_id])).rows[0];
      expect(ret.status).toBe('completed');
      expect(ret.reason_id).toBe(s.reason);
      expect(ret.created_by).toBe(s.rep);

      // return_in posted to the VAN, not the branch warehouse.
      const vanMv = (await c.query("select quantity from erp_stock_movements where reference_id=$1 and movement_type='return_in' and warehouse_id=$2", [res.return_id, s.van])).rows[0];
      expect(Number(vanMv.quantity)).toBe(2);
      const branchMv = await c.query("select 1 from erp_stock_movements where reference_id=$1 and warehouse_id=$2", [res.return_id, branchWh]);
      expect(branchMv.rows.length).toBe(0);

      // Van on-hand reconciles up by the returned qty; customer balance down by total.
      const vanQty = (await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [s.van, s.product])).rows[0].quantity;
      expect(Number(vanQty)).toBe(7);
      const bal = (await c.query('select balance from erp_customers where id=$1', [s.customer])).rows[0].balance;
      expect(Number(bal)).toBe(800);
    });
  }, 30_000);

  it('credit-note linkage: creates a traceable credit note tied to the return + invoice', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 5 });
      // An original invoice (priced at 120) for traceability + pricing.
      const inv = (await c.query("insert into erp_invoices(branch_id,customer_id,invoice_number,status,net_amount) values ($1,$2,$3,'issued',120) returning id", [s.branch, s.customer, `INV-${randomUUID().slice(0, 6)}`])).rows[0].id;
      await c.query('insert into erp_invoice_lines(invoice_id,product_id,quantity,unit_price,line_total) values ($1,$2,1,120,120)', [inv, s.product]);

      await actAs(c, s.rep);
      const res = await vanReturn(c, s, [{ product_id: s.product, quantity: 1 }], { invoiceId: inv, creditNote: true });
      await resetRole(c);

      expect(res.credit_note_id).toBeTruthy();
      const cn = (await c.query('select return_id, invoice_id, credit_note_number, amount, status from erp_credit_notes where id=$1', [res.credit_note_id])).rows[0];
      expect(cn.return_id).toBe(res.return_id);
      expect(cn.invoice_id).toBe(inv);
      expect(cn.credit_note_number).toBe(`CN-${res.return_number}`);
      expect(cn.status).toBe('issued');
      // Priced from the ORIGINAL invoice line (120), not the base sell_price (100).
      expect(Number(cn.amount)).toBe(120);
      expect(Number(res.total_amount)).toBe(120);
      // The return row records the original invoice (traceable).
      const ret = (await c.query('select invoice_id from erp_sales_returns where id=$1', [res.return_id])).rows[0];
      expect(ret.invoice_id).toBe(inv);
    });
  }, 30_000);

  it('audit: writes a van_return.complete audit row with reason + invoice + qty', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 50, vanStock: 10 });
      await actAs(c, s.rep);
      const res = await vanReturn(c, s, [{ product_id: s.product, quantity: 3 }]);
      await resetRole(c);
      const audit = (await c.query("select details from erp_audit_logs where action='van_return.complete' and entity_id=$1", [res.return_id])).rows[0];
      expect(audit).toBeTruthy();
      expect(audit.details.reason_id).toBe(s.reason);
      expect(audit.details.lines).toBe(1);
    });
  }, 30_000);

  it('reason is mandatory and must be valid for the company', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 5 });
      await actAs(c, s.rep);
      await c.query('savepoint a');
      await expect(vanReturn(c, s, [{ product_id: s.product, quantity: 1 }], { reasonId: null })).rejects.toThrow(/reason_required/);
      await c.query('rollback to savepoint a');
      await c.query('savepoint b');
      await expect(vanReturn(c, s, [{ product_id: s.product, quantity: 1 }], { reasonId: randomUUID() })).rejects.toThrow(/invalid_reason/);
      await c.query('rollback to savepoint b');
      await resetRole(c);
    });
  }, 30_000);

  it('requires a van — a rep with no van cannot return (no branch fallback)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, assignVan: false });
      await actAs(c, s.rep);
      await c.query('savepoint a');
      await expect(vanReturn(c, s, [{ product_id: s.product, quantity: 1 }])).rejects.toThrow(/no_van_assigned/);
      await c.query('rollback to savepoint a');
      await resetRole(c);
    });
  }, 30_000);

  it('is idempotent: a repeat key returns the same return and restocks once', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 5, balance: 1000 });
      const key = randomUUID();
      await actAs(c, s.rep);
      const a = await vanReturn(c, s, [{ product_id: s.product, quantity: 2 }], { key });
      const b = await vanReturn(c, s, [{ product_id: s.product, quantity: 2 }], { key });
      await resetRole(c);
      expect(b.return_id).toBe(a.return_id);
      const n = (await c.query('select count(*)::int n from erp_sales_returns where idempotency_key=$1', [key])).rows[0].n;
      expect(n).toBe(1);
      // Restocked once (van 5 → 7) and credited once (balance 1000 → 800).
      const vanQty = (await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [s.van, s.product])).rows[0].quantity;
      expect(Number(vanQty)).toBe(7);
      const bal = (await c.query('select balance from erp_customers where id=$1', [s.customer])).rows[0].balance;
      expect(Number(bal)).toBe(800);
    });
  }, 30_000);

  it('tenant isolation: a rep cannot return against a branch they do not belong to', async () => {
    await withRollback(async (c) => {
      const a = await seed(c, { sellPrice: 100, vanStock: 5 });
      const b = await seed(c, { sellPrice: 100, vanStock: 5 });
      await actAs(c, b.rep);
      await c.query('savepoint a');
      await expect(
        c.query('select * from erp_van_return($1,$2,$3::jsonb,$4,null,false,null,null)', [a.branch, b.customer, JSON.stringify([{ product_id: b.product, quantity: 1 }]), b.reason]),
      ).rejects.toThrow(/branch_access_denied/);
      await c.query('rollback to savepoint a');
      await resetRole(c);
    });
  }, 30_000);
});
