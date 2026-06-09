import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * 0265 — erp_van_sell: the atomic field sale off the van.
 *
 * Exercises every guarantee of the RPC against a real Postgres, each inside a
 * rolled-back transaction. The function is SECURITY DEFINER and reads auth.uid()
 * for the acting rep, so we `actAs(rep)` before calling it and `resetRole()` to
 * assert the resulting rows. Gated on TEST_DATABASE_URL.
 */

interface Seed {
  company: string;
  branch: string;
  rep: string;
  van: string;
  product: string;
  customer: string;
}

/** Seed a company/branch/rep with a van, one priced product, stock, a customer. */
async function seed(c: Client, opts: { sellPrice?: number; taxRate?: number; vanStock?: number; creditLimit?: number; assignVan?: boolean } = {}): Promise<Seed> {
  const sfx = randomUUID().slice(0, 8);
  const company = (await c.query("insert into erp_companies(name) values('VSELL') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const rep = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [rep, `r+${rep}@test.local`]);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [rep, branch, 'salesman']);

  let van = '';
  if (opts.assignVan !== false) {
    van = (await c.query(
      "insert into erp_warehouses(branch_id,code,name,is_van,assigned_to) values ($1,$2,'Van',true,$3) returning id",
      [branch, `VAN-${sfx}`, rep],
    )).rows[0].id;
  }
  const product = (await c.query(
    "insert into erp_products_catalog(company_id,code,name,sell_price,tax_rate) values ($1,$2,'P',$3,$4) returning id",
    [company, `P-${sfx}`, opts.sellPrice ?? 100, opts.taxRate ?? 0],
  )).rows[0].id;
  if (van && opts.vanStock !== undefined) {
    await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,$3)', [van, product, opts.vanStock]);
  }
  const customer = (await c.query(
    "insert into erp_customers(company_id,code,name,is_approved,credit_limit,balance) values ($1,$2,'C',true,$3,0) returning id",
    [company, `C-${sfx}`, opts.creditLimit ?? 0],
  )).rows[0].id;
  return { company, branch, rep, van, product, customer };
}

/** Call erp_van_sell as the rep; returns the single result row. */
async function vanSell(c: Client, s: Seed, lines: object[], opts: { key?: string | null; branch?: string } = {}) {
  const { rows } = await c.query(
    'select * from erp_van_sell($1,$2,$3::jsonb,$4,null,null)',
    [opts.branch ?? s.branch, s.customer, JSON.stringify(lines), opts.key ?? null],
  );
  return rows[0] as { invoice_id: string; invoice_number: string; net_amount: string };
}

describe.skipIf(!hasTestDb)('van-sell · erp_van_sell (0265)', () => {
  it('happy path: issues an invoice, posts sale_out at the van, raises the balance, server-resolves price', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 10 });
      await actAs(c, s.rep);
      const res = await vanSell(c, s, [{ product_id: s.product, quantity: 2 }]);
      await resetRole(c);

      expect(res.invoice_number).toMatch(/INV/);
      expect(Number(res.net_amount)).toBe(200);

      const inv = (await c.query('select status, net_amount, created_by from erp_invoices where id=$1', [res.invoice_id])).rows[0];
      expect(inv.status).toBe('issued');
      expect(inv.created_by).toBe(s.rep);

      // Price came from the server (sell_price), not the caller.
      const line = (await c.query('select unit_price, quantity, line_total from erp_invoice_lines where invoice_id=$1', [res.invoice_id])).rows[0];
      expect(Number(line.unit_price)).toBe(100);

      // Stock left the van.
      const mv = (await c.query(
        "select quantity from erp_stock_movements where reference_id=$1 and movement_type='sale_out' and warehouse_id=$2",
        [res.invoice_id, s.van],
      )).rows[0];
      expect(Number(mv.quantity)).toBe(-2);

      // Customer owes the net.
      const bal = (await c.query('select balance from erp_customers where id=$1', [s.customer])).rows[0].balance;
      expect(Number(bal)).toBe(200);
    });
  }, 30_000);

  it('uses the server-resolved price (a customer percent_off rule), not the base', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 10 });
      // 10% off for this specific customer — resolved by erp_resolve_price, which
      // is exactly what the Phase 2 preview surfaces and the RPC commits.
      await c.query(
        "insert into erp_price_rules(company_id,product_id,scope_type,scope_id,price_type,value,min_qty,is_active) values ($1,$2,'customer',$3,'percent_off',10,1,true)",
        [s.company, s.product, s.customer],
      );
      await actAs(c, s.rep);
      const res = await vanSell(c, s, [{ product_id: s.product, quantity: 2 }]);
      await resetRole(c);
      // base 100 − 10% = 90 resolved unit price; net 2 × 90 = 180.
      const line = (await c.query('select unit_price from erp_invoice_lines where invoice_id=$1', [res.invoice_id])).rows[0];
      expect(Number(line.unit_price)).toBe(90);
      expect(Number(res.net_amount)).toBe(180);
    });
  }, 30_000);

  it('enforces the discount cap; a within-cap discount succeeds', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 10 });
      await c.query('insert into erp_van_sales_settings(company_id,discount_cap_pct,is_enabled) values ($1,10,true)', [s.company]);

      await actAs(c, s.rep);
      await c.query('savepoint sp');
      await expect(vanSell(c, s, [{ product_id: s.product, quantity: 1, discount_pct: 25 }])).rejects.toThrow(/discount_exceeds_cap/);
      await c.query('rollback to savepoint sp');

      const res = await vanSell(c, s, [{ product_id: s.product, quantity: 1, discount_pct: 10 }]);
      await resetRole(c);
      // 100 gross − 10% = 90 net.
      expect(Number(res.net_amount)).toBe(90);
    });
  }, 30_000);

  it('rejects a sale that would exceed the customer credit limit', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 10, creditLimit: 150 });
      await actAs(c, s.rep);
      await c.query('savepoint sp');
      await expect(vanSell(c, s, [{ product_id: s.product, quantity: 2 }])).rejects.toThrow(/over_credit/);
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);

  it('blocks overselling the van; allow_negative_van_stock lets it through', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 1 });
      await actAs(c, s.rep);
      await c.query('savepoint sp');
      await expect(vanSell(c, s, [{ product_id: s.product, quantity: 5 }])).rejects.toThrow(/insufficient_van_stock/);
      await c.query('rollback to savepoint sp');
      await resetRole(c);

      // Flip the policy and retry — the same sale now succeeds (van goes negative).
      await c.query('insert into erp_van_sales_settings(company_id,allow_negative_van_stock,is_enabled) values ($1,true,true)', [s.company]);
      await actAs(c, s.rep);
      const res = await vanSell(c, s, [{ product_id: s.product, quantity: 5 }]);
      await resetRole(c);
      expect(Number(res.net_amount)).toBe(500);
    });
  }, 30_000);

  it('requires a van — a rep with no van cannot sell (no branch fallback)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, assignVan: false });
      await actAs(c, s.rep);
      await c.query('savepoint sp');
      await expect(vanSell(c, s, [{ product_id: s.product, quantity: 1 }])).rejects.toThrow(/no_van_assigned/);
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);

  it('is idempotent: a repeat key returns the same invoice and sells once', async () => {
    await withRollback(async (c) => {
      const s = await seed(c, { sellPrice: 100, vanStock: 10 });
      const key = randomUUID();
      await actAs(c, s.rep);
      const a = await vanSell(c, s, [{ product_id: s.product, quantity: 2 }], { key });
      const b = await vanSell(c, s, [{ product_id: s.product, quantity: 2 }], { key });
      await resetRole(c);

      expect(b.invoice_id).toBe(a.invoice_id);
      const n = (await c.query('select count(*)::int n from erp_invoices where idempotency_key=$1', [key])).rows[0].n;
      expect(n).toBe(1);
      // Balance raised exactly once.
      const bal = (await c.query('select balance from erp_customers where id=$1', [s.customer])).rows[0].balance;
      expect(Number(bal)).toBe(200);
    });
  }, 30_000);

  it('tenant isolation: a rep cannot sell against a branch they do not belong to', async () => {
    await withRollback(async (c) => {
      const a = await seed(c, { sellPrice: 100, vanStock: 10 }); // company A
      const b = await seed(c, { sellPrice: 100, vanStock: 10 }); // company B
      // Rep B (no access to A's branch) targets A's branch.
      await actAs(c, b.rep);
      await c.query('savepoint sp');
      await expect(
        c.query('select * from erp_van_sell($1,$2,$3::jsonb,null,null,null)', [a.branch, b.customer, JSON.stringify([{ product_id: b.product, quantity: 1 }])]),
      ).rejects.toThrow(/branch_access_denied/);
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);
});
