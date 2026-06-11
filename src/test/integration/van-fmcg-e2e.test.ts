import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FMCG Pilot — END-TO-END demo + validation suite (Phase 8).
 *
 * One pass through the REAL field loop on the real RPCs, then the named pilot
 * validation scenarios. This is the executable companion to the Pilot Runbook
 * (docs/architecture/fmcg/PILOT-RUNBOOK.md): if this suite is green against a
 * properly-seeded company, the operational loop works end to end.
 *
 *   Visit → Sell → Invoice → Collect → Return → (stock) Reconcile
 *
 * The RPCs are SECURITY DEFINER and read auth.uid(), so we actAs(rep). Each test
 * runs in a rolled-back transaction. Gated on TEST_DATABASE_URL.
 */

interface World {
  company: string; branch: string; rep: string; van: string;
  pA: string; pB: string; customer: string; reason: string; session: string;
}

/** Seed a pilot-shaped company: a rep with an assigned, stocked van; two priced
 *  products; an approved customer assigned to the rep; a return reason; van-sales
 *  policy; an open work session. Mirrors the runbook's setup checklist. */
async function seedWorld(c: Client, opts: { vanStockA?: number; vanStockB?: number; priceA?: number; priceB?: number; taxA?: number; creditLimit?: number; discountCap?: number | null } = {}): Promise<World> {
  const sfx = randomUUID().slice(0, 8);
  const company = (await c.query("insert into erp_companies(name) values('PILOT') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const rep = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [rep, `rep+${rep}@pilot.test`]);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [rep, branch, 'salesman']);

  const van = (await c.query("insert into erp_warehouses(branch_id,code,name,is_van,assigned_to) values ($1,$2,'Van',true,$3) returning id", [branch, `VAN-${sfx}`, rep])).rows[0].id;
  const pA = (await c.query("insert into erp_products_catalog(company_id,code,name,sell_price,tax_rate) values ($1,$2,'Prod A',$3,$4) returning id", [company, `A-${sfx}`, opts.priceA ?? 100, opts.taxA ?? 0])).rows[0].id;
  const pB = (await c.query("insert into erp_products_catalog(company_id,code,name,sell_price,tax_rate) values ($1,$2,'Prod B',$3,0) returning id", [company, `B-${sfx}`, opts.priceB ?? 50])).rows[0].id;
  await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,$3)', [van, pA, opts.vanStockA ?? 100]);
  await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,$3)', [van, pB, opts.vanStockB ?? 100]);

  const customer = (await c.query(
    "insert into erp_customers(company_id,branch_id,code,name,is_approved,credit_limit,balance,salesman_id) values ($1,$2,$3,'Pilot Customer',true,$4,0,$5) returning id",
    [company, branch, `C-${sfx}`, opts.creditLimit ?? 0, rep],
  )).rows[0].id;
  const reason = (await c.query("insert into erp_return_reasons(company_id,code,label_en,label_ar) values ($1,'damaged','Damaged','تالف') returning id", [company])).rows[0].id;
  if (opts.discountCap !== undefined && opts.discountCap !== null) {
    await c.query('insert into erp_van_sales_settings(company_id,is_enabled,discount_cap_pct) values ($1,true,$2)', [company, opts.discountCap]);
  }
  const session = (await c.query("insert into erp_work_sessions(branch_id,salesman_id,status) values ($1,$2,'open') returning id", [branch, rep])).rows[0].id;
  return { company, branch, rep, van, pA, pB, customer, reason, session };
}

const vanStock = async (c: Client, w: World, product: string) =>
  Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [w.van, product])).rows[0]?.quantity ?? 0);
const balance = async (c: Client, w: World) =>
  Number((await c.query('select balance from erp_customers where id=$1', [w.customer])).rows[0].balance);

async function sell(c: Client, w: World, lines: object[], key?: string) {
  return (await c.query('select * from erp_van_sell($1,$2,$3::jsonb,$4,null,null)', [w.branch, w.customer, JSON.stringify(lines), key ?? null])).rows[0];
}
async function collect(c: Client, w: World, amount: number, specified?: object | null, key?: string) {
  return (await c.query("select * from erp_settle_collection($1,$2,$3,'cash',null,$4::jsonb,$5,null)", [w.branch, w.customer, amount, specified ? JSON.stringify(specified) : null, key ?? null])).rows[0];
}
async function vanReturn(c: Client, w: World, lines: object[], reasonId: string | null, invoiceId?: string | null, creditNote?: boolean) {
  return (await c.query('select * from erp_van_return($1,$2,$3::jsonb,$4,$5,$6,null,null)', [w.branch, w.customer, JSON.stringify(lines), reasonId, invoiceId ?? null, creditNote ?? false])).rows[0];
}

describe.skipIf(!hasTestDb)('FMCG pilot · end-to-end (Visit → Sell → Invoice → Collect → Return → Reconcile)', () => {
  it('full loop: a rep visits, sells, collects partially, accepts a return, and stock reconciles', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 100, priceA: 100, creditLimit: 0 });
      await actAs(c, w.rep);

      // 1) VISIT — check in at the customer (anchors the field session).
      const ci = (await c.query('select erp_check_in_visit($1,$2,$3,$4) v', [w.customer, null, null, w.session])).rows[0].v;
      expect(ci.blocked ?? false).toBe(false);
      await resetRole(c);
      const visit = (await c.query('select id from erp_visits where customer_id=$1 and salesman_id=$2', [w.customer, w.rep])).rows[0];
      expect(visit?.id).toBeTruthy();

      // 2-3) SELL → INVOICE — 3 × ProdA @100 = 300.
      await actAs(c, w.rep);
      const sale = await sell(c, w, [{ product_id: w.pA, quantity: 3 }]);
      await resetRole(c);
      expect(Number(sale.net_amount)).toBe(300);
      expect((await c.query('select status from erp_invoices where id=$1', [sale.invoice_id])).rows[0].status).toBe('issued');
      expect(await vanStock(c, w, w.pA)).toBe(97);        // 100 − 3 sold
      expect(await balance(c, w)).toBe(300);              // AR raised

      // 4) COLLECT (partial) — 200 of 300.
      await actAs(c, w.rep);
      const col = await collect(c, w, 200);
      await resetRole(c);
      expect(Number(col.total_applied)).toBe(200);
      expect((await c.query('select status, paid_amount from erp_invoices where id=$1', [sale.invoice_id])).rows[0].status).toBe('partially_paid');
      expect(await balance(c, w)).toBe(100);              // 300 − 200

      // 5) RETURN (to van) + credit note — 1 × ProdA, priced off the invoice.
      await actAs(c, w.rep);
      const ret = await vanReturn(c, w, [{ product_id: w.pA, quantity: 1 }], w.reason, sale.invoice_id, true);
      await resetRole(c);
      expect(ret.credit_note_id).toBeTruthy();
      expect(Number(ret.total_amount)).toBe(100);
      expect(await vanStock(c, w, w.pA)).toBe(98);        // 97 + 1 returned to van
      expect(await balance(c, w)).toBe(0);                // 100 − 100 credited

      // 6) RECONCILE (stock) — van on-hand == loaded − sold + returned.
      expect(await vanStock(c, w, w.pA)).toBe(100 - 3 + 1);
      const moves = (await c.query(
        "select movement_type, sum(quantity) q from erp_stock_movements where warehouse_id=$1 and product_id=$2 group by movement_type order by movement_type", [w.van, w.pA])).rows;
      const byType = Object.fromEntries(moves.map((m: { movement_type: string; q: string }) => [m.movement_type, Number(m.q)]));
      expect(byType['sale_out']).toBe(-3);
      expect(byType['return_in']).toBe(1);
    });
  }, 40_000);

  // ── Named pilot validation scenarios ──────────────────────────────────────

  it('Scenario · normal sale', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 10, priceA: 100 });
      await actAs(c, w.rep);
      const s = await sell(c, w, [{ product_id: w.pA, quantity: 2 }]);
      await resetRole(c);
      expect(Number(s.net_amount)).toBe(200);
      expect(await vanStock(c, w, w.pA)).toBe(8);
      expect(await balance(c, w)).toBe(200);
    });
  }, 40_000);

  it('Scenario · sale with discount (within company cap)', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 10, priceA: 100, discountCap: 15 });
      await actAs(c, w.rep);
      const s = await sell(c, w, [{ product_id: w.pA, quantity: 2, discount_pct: 10 }]);
      await resetRole(c);
      expect(Number(s.net_amount)).toBe(180); // 200 − 10%
    });
  }, 40_000);

  it('Scenario · partial collection then full collection clears the invoice', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 10, priceA: 100 });
      await actAs(c, w.rep);
      const s = await sell(c, w, [{ product_id: w.pA, quantity: 2 }]); // 200
      await collect(c, w, 120);
      let inv = (await c.query('select status, paid_amount from erp_invoices where id=$1', [s.invoice_id])).rows[0];
      expect(inv.status).toBe('partially_paid'); expect(Number(inv.paid_amount)).toBe(120);
      await collect(c, w, 80);
      await resetRole(c);
      inv = (await c.query('select status, paid_amount from erp_invoices where id=$1', [s.invoice_id])).rows[0];
      expect(inv.status).toBe('paid'); expect(Number(inv.paid_amount)).toBe(200);
      expect(await balance(c, w)).toBe(0);
    });
  }, 40_000);

  it('Scenario · multi-invoice collection (oldest-first across two sales)', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 10, vanStockB: 10, priceA: 100, priceB: 50 });
      await actAs(c, w.rep);
      const s1 = await sell(c, w, [{ product_id: w.pA, quantity: 1 }]); // 100
      const s2 = await sell(c, w, [{ product_id: w.pB, quantity: 2 }]); // 100
      await resetRole(c);
      // Make s1 deterministically the OLDEST (both van-sales are same-instant).
      await c.query("update erp_invoices set due_date='2026-01-01' where id=$1", [s1.invoice_id]);
      await c.query("update erp_invoices set due_date='2026-02-01' where id=$1", [s2.invoice_id]);
      await actAs(c, w.rep);
      const col = await collect(c, w, 150); // clears s1, half of s2
      await resetRole(c);
      expect(Number(col.total_applied)).toBe(150);
      expect((await c.query('select status from erp_invoices where id=$1', [s1.invoice_id])).rows[0].status).toBe('paid');
      expect((await c.query('select status, paid_amount from erp_invoices where id=$1', [s2.invoice_id])).rows[0].paid_amount).toBe('50.00');
      expect(await balance(c, w)).toBe(50);
    });
  }, 40_000);

  it('Scenario · return with credit note restocks the van and credits the customer', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 10, priceA: 100 });
      await actAs(c, w.rep);
      const s = await sell(c, w, [{ product_id: w.pA, quantity: 3 }]); // 300
      const ret = await vanReturn(c, w, [{ product_id: w.pA, quantity: 1 }], w.reason, s.invoice_id, true);
      await resetRole(c);
      expect(ret.credit_note_id).toBeTruthy();
      const cn = (await c.query('select credit_note_number, amount, status from erp_credit_notes where id=$1', [ret.credit_note_id])).rows[0];
      expect(cn.credit_note_number).toBe(`CN-${ret.return_number}`);
      expect(cn.status).toBe('issued'); expect(Number(cn.amount)).toBe(100);
      expect(await vanStock(c, w, w.pA)).toBe(8); // 10 − 3 + 1
      expect(await balance(c, w)).toBe(200);      // 300 − 100
    });
  }, 40_000);

  it('Scenario · stock reconciliation holds after sell + return', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 50, priceA: 100 });
      await actAs(c, w.rep);
      await sell(c, w, [{ product_id: w.pA, quantity: 12 }]);
      await vanReturn(c, w, [{ product_id: w.pA, quantity: 4 }], w.reason, null, false);
      await resetRole(c);
      expect(await vanStock(c, w, w.pA)).toBe(50 - 12 + 4); // 42
    });
  }, 40_000);

  it('Scenario · failed validations are rejected (over-credit · discount-over-cap · missing reason · no van)', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 10, priceA: 100, creditLimit: 150, discountCap: 10 });
      await actAs(c, w.rep);

      // over credit limit (2 × 100 = 200 > 150)
      await c.query('savepoint s1');
      await expect(sell(c, w, [{ product_id: w.pA, quantity: 2 }])).rejects.toThrow(/over_credit/);
      await c.query('rollback to savepoint s1');

      // discount beyond the 10% cap
      await c.query('savepoint s2');
      await expect(sell(c, w, [{ product_id: w.pA, quantity: 1, discount_pct: 25 }])).rejects.toThrow(/discount_exceeds_cap/);
      await c.query('rollback to savepoint s2');

      // return without a reason
      await c.query('savepoint s3');
      await expect(vanReturn(c, w, [{ product_id: w.pA, quantity: 1 }], null)).rejects.toThrow(/reason_required/);
      await c.query('rollback to savepoint s3');

      await resetRole(c);
    });
  }, 40_000);

  it('Scenario · failed validation: a rep with no assigned van cannot sell', async () => {
    await withRollback(async (c) => {
      const w = await seedWorld(c, { vanStockA: 10, priceA: 100 });
      // Unassign the van from the rep.
      await c.query('update erp_warehouses set assigned_to = null where id=$1', [w.van]);
      await actAs(c, w.rep);
      await c.query('savepoint nv');
      await expect(sell(c, w, [{ product_id: w.pA, quantity: 1 }])).rejects.toThrow(/no_van_assigned/);
      await c.query('rollback to savepoint nv');
      await resetRole(c);
    });
  }, 40_000);
});
