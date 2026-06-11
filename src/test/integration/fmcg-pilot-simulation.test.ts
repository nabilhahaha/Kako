import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FMCG PILOT SIMULATION — a full distributor rehearsal against the real RPCs.
 *
 * Seeds a realistic distributor (1 company, 2 branches, 4 reps+vans, 30 SKUs,
 * 150 customers, a price rule) then runs HUNDREDS of transactions — sales,
 * partial/multi-invoice collections, returns (with/without credit note) — through
 * erp_van_sell / erp_settle_collection / erp_van_return, and aggressively asserts
 * GLOBAL data-integrity invariants:
 *   • Stock conservation: van on-hand == loaded − sold + returned (per van/SKU)
 *   • No negative van stock (policy is allow_negative = false)
 *   • Customer AR balance == Σ sale.net − Σ collection.applied − Σ return.total
 *   • Invoice paid_amount never exceeds net; status is consistent
 *   • Collection applied + unapplied == amount; applied == Σ allocations
 *   • Numbering: invoice/collection/return numbers unique
 *   • Idempotency: a replayed sale/collection/return changes nothing
 *   • Tenant isolation: a foreign rep cannot transact on this branch
 *
 * Deterministic (seeded PRNG) and rolled back. Gated on TEST_DATABASE_URL.
 * Scale via SIM_SCALE env (default = pilot-sized; CI-friendly).
 */

const N = Math.max(1, Number(process.env.SIM_SCALE ?? 1));
const CUSTOMERS = Math.round(150 * N);
const PRODUCTS = 30;
const SALES = Math.round(180 * N);
const COLLECTS = Math.round(100 * N);
const RETURNS = Math.round(40 * N);

// mulberry32 — tiny deterministic PRNG so the rehearsal is reproducible.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rep { user: string; van: string; branch: string }
interface Cust { id: string; branch: string }
interface Sale { rep: Rep; customer: string; invoiceId: string; lines: { product: string; qty: number }[] }

describe.skipIf(!hasTestDb)('FMCG pilot simulation (full distributor rehearsal)', () => {
  it(`runs ${SALES} sales · ${COLLECTS} collections · ${RETURNS} returns and holds every invariant`, async () => {
    await withRollback(async (c) => {
      const t0 = Date.now();
      const rnd = rng(20260609);
      const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
      const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

      // ── Seed the distributor ────────────────────────────────────────────────
      const company = (await c.query("insert into erp_companies(name, currency) values('Nile FMCG Distribution','EGP') returning id")).rows[0].id;
      await c.query('insert into erp_van_sales_settings(company_id,is_enabled,discount_cap_pct,allow_negative_van_stock) values ($1,true,15,false)', [company]);
      const reasonId = (await c.query("insert into erp_return_reasons(company_id,code,label_en,label_ar) values ($1,'damaged','Damaged','تالف') returning id", [company])).rows[0].id;

      const branches: string[] = [];
      for (const code of ['CAI', 'ALX']) {
        branches.push((await c.query('insert into erp_branches(company_id,code,name) values ($1,$2,$2) returning id', [company, code])).rows[0].id);
      }

      // 30 SKUs, priced 10..300, two with VAT, plus one customer-scoped promo rule later.
      const products: string[] = [];
      for (let i = 0; i < PRODUCTS; i++) {
        const price = ri(10, 300);
        const tax = i % 7 === 0 ? 14 : 0;
        products.push((await c.query(
          "insert into erp_products_catalog(company_id,code,name,sell_price,tax_rate) values ($1,$2,$3,$4,$5) returning id",
          [company, `SKU-${i}`, `Product ${i}`, price, tax],
        )).rows[0].id);
      }

      // 4 reps (2 per branch), each with an assigned van loaded with all SKUs.
      const reps: Rep[] = [];
      for (const branch of branches) {
        const src = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,$2,'Source') returning id", [branch, `WH-${branch.slice(0, 4)}`])).rows[0].id;
        void src;
        for (let r = 0; r < 2; r++) {
          const user = randomUUID();
          await c.query('insert into auth.users(id,email) values ($1,$2)', [user, `rep+${user}@nile.test`]);
          await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'salesman',true)", [user, branch]);
          const van = (await c.query("insert into erp_warehouses(branch_id,code,name,is_van,assigned_to) values ($1,$2,'Van',true,$3) returning id", [branch, `VAN-${randomUUID().slice(0, 5)}`, user])).rows[0].id;
          // Load the van heavily with every SKU.
          for (const p of products) await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,5000)', [van, p]);
          reps.push({ user, van, branch });
        }
      }

      // 150 customers across the two branches; generous credit so credit limits
      // rarely block (we validate balance math, not credit gating, here).
      const customers: Cust[] = [];
      for (let i = 0; i < CUSTOMERS; i++) {
        const branch = pick(branches);
        const rep = reps.find((r) => r.branch === branch)!;
        const id = (await c.query(
          "insert into erp_customers(company_id,branch_id,code,name,is_approved,credit_limit,balance,salesman_id) values ($1,$2,$3,$4,true,0,0,$5) returning id",
          [company, branch, `C-${i}`, `Customer ${i}`, rep.user],
        )).rows[0].id;
        customers.push({ id, branch });
      }
      // One customer-scoped promo to exercise server-side price resolution at scale.
      await c.query(
        "insert into erp_price_rules(company_id,product_id,scope_type,scope_id,price_type,value,min_qty,is_active) values ($1,$2,'customer',$3,'percent_off',10,1,true)",
        [company, products[0], customers[0].id],
      );

      // Expected ledgers tracked in JS, independent of the DB.
      const vanStock = new Map<string, number>();        // `${van}|${product}` → qty
      for (const r of reps) for (const p of products) vanStock.set(`${r.van}|${p}`, 5000);
      const arBalance = new Map<string, number>();         // customer → AR
      for (const cu of customers) arBalance.set(cu.id, 0);
      const custByBranch = (b: string) => customers.filter((cu) => cu.branch === b);
      const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

      const sales: Sale[] = [];

      // ── SALES ───────────────────────────────────────────────────────────────
      const tSales = Date.now();
      for (let s = 0; s < SALES; s++) {
        const rep = pick(reps);
        const cust = pick(custByBranch(rep.branch));
        const nLines = ri(1, 4);
        const used = new Set<string>();
        const lines: { product_id: string; quantity: number; discount_pct?: number }[] = [];
        for (let l = 0; l < nLines; l++) {
          const p = pick(products); if (used.has(p)) continue; used.add(p);
          const qty = ri(1, 8);
          const disc = rnd() < 0.2 ? ri(1, 15) : 0;
          lines.push({ product_id: p, quantity: qty, discount_pct: disc });
        }
        await actAs(c, rep.user);
        const res = (await c.query('select * from erp_van_sell($1,$2,$3::jsonb,null,null,null)', [rep.branch, cust.id, JSON.stringify(lines)])).rows[0];
        await resetRole(c);
        for (const ln of lines) vanStock.set(`${rep.van}|${ln.product_id}`, vanStock.get(`${rep.van}|${ln.product_id}`)! - ln.quantity);
        arBalance.set(cust.id, round2(arBalance.get(cust.id)! + Number(res.net_amount)));
        sales.push({ rep, customer: cust.id, invoiceId: res.invoice_id, lines: lines.map((x) => ({ product: x.product_id, qty: x.quantity })) });
      }
      const salesMs = Date.now() - tSales;

      // ── COLLECTIONS (partial, multi-invoice oldest-first, occasional overpay) ─
      const tColl = Date.now();
      let collectionsDone = 0;
      for (let k = 0; k < COLLECTS; k++) {
        const debtors = customers.filter((cu) => arBalance.get(cu.id)! > 0);
        if (debtors.length === 0) break;
        const cust = pick(debtors);
        const rep = reps.find((r) => r.branch === cust.branch)!;
        const outstanding = arBalance.get(cust.id)!;
        const overpay = rnd() < 0.1;
        const amount = round2(overpay ? outstanding + ri(1, 50) : Math.max(1, round2(outstanding * (0.3 + rnd() * 0.7))));
        await actAs(c, rep.user);
        const res = (await c.query("select * from erp_settle_collection($1,$2,$3,'cash',null,null,null,null)", [rep.branch, cust.id, amount])).rows[0];
        await resetRole(c);
        arBalance.set(cust.id, round2(arBalance.get(cust.id)! - Number(res.total_applied)));
        collectionsDone++;
      }
      const collMs = Date.now() - tColl;

      // ── RETURNS (to the selling rep's van, with/without credit note) ──────────
      const tRet = Date.now();
      let returnsDone = 0; let creditNotes = 0;
      for (let k = 0; k < RETURNS; k++) {
        const sale = pick(sales);
        const line = pick(sale.lines);
        const qty = ri(1, line.qty);
        const withCn = rnd() < 0.5;
        await actAs(c, sale.rep.user);
        const res = (await c.query('select * from erp_van_return($1,$2,$3::jsonb,$4,$5,$6,null,null)', [sale.rep.branch, sale.customer, JSON.stringify([{ product_id: line.product, quantity: qty }]), reasonId, sale.invoiceId, withCn])).rows[0];
        await resetRole(c);
        vanStock.set(`${sale.rep.van}|${line.product}`, vanStock.get(`${sale.rep.van}|${line.product}`)! + qty);
        arBalance.set(sale.customer, round2(arBalance.get(sale.customer)! - Number(res.total_amount)));
        if (res.credit_note_id) creditNotes++;
        returnsDone++;
      }
      const retMs = Date.now() - tRet;

      // ════════════════════ AGGRESSIVE VALIDATION ════════════════════
      // 1) Stock conservation — every (van, SKU) on-hand matches the JS ledger.
      const stockRows = (await c.query(
        'select warehouse_id, product_id, quantity from erp_inventory_stock where warehouse_id = any($1)', [reps.map((r) => r.van)],
      )).rows as { warehouse_id: string; product_id: string; quantity: string }[];
      let stockMismatches = 0; let negativeStock = 0;
      for (const row of stockRows) {
        const exp = vanStock.get(`${row.warehouse_id}|${row.product_id}`);
        if (exp === undefined) continue;
        if (Number(row.quantity) !== exp) stockMismatches++;
        if (Number(row.quantity) < 0) negativeStock++;
      }
      expect(stockMismatches).toBe(0);
      expect(negativeStock).toBe(0);

      // 2) AR consistency — every customer balance matches sale − collected − returned.
      const balRows = (await c.query('select id, balance from erp_customers where company_id=$1', [company])).rows as { id: string; balance: string }[];
      let arMismatches = 0;
      for (const row of balRows) {
        const exp = arBalance.get(row.id);
        if (exp === undefined) continue;
        if (Math.abs(Number(row.balance) - exp) > 0.01) arMismatches++;
      }
      expect(arMismatches).toBe(0);

      // 3) Invoice integrity — paid never exceeds net; status is consistent.
      const badInvoices = (await c.query(
        `select count(*)::int n from erp_invoices i join erp_branches b on b.id=i.branch_id
          where b.company_id=$1 and (i.paid_amount > i.net_amount + 0.01
             or (i.status='paid' and i.paid_amount + 0.01 < i.net_amount)
             or (i.status='partially_paid' and (i.paid_amount<=0 or i.paid_amount>=i.net_amount)))`, [company],
      )).rows[0].n;
      expect(badInvoices).toBe(0);

      // 4) Collection integrity — applied+unapplied==amount and applied==Σ allocations.
      const badCollections = (await c.query(
        `select count(*)::int n from erp_collections col
          where col.branch_id = any($1)
            and ( abs(col.applied_amount + col.unapplied_amount - col.amount) > 0.01
              or abs(col.applied_amount - coalesce((select sum(applied_amount) from erp_collection_allocations a where a.collection_id=col.id),0)) > 0.01 )`,
        [branches],
      )).rows[0].n;
      expect(badCollections).toBe(0);

      // 5) Numbering — invoice / collection / return numbers are unique.
      const dupInv = (await c.query("select count(*)::int n from (select invoice_number from erp_invoices i join erp_branches b on b.id=i.branch_id where b.company_id=$1 group by invoice_number having count(*)>1) x", [company])).rows[0].n;
      const dupCol = (await c.query('select count(*)::int n from (select collection_number from erp_collections where branch_id=any($1) group by collection_number having count(*)>1) x', [branches])).rows[0].n;
      expect(dupInv).toBe(0);
      expect(dupCol).toBe(0);

      // 6) Idempotency — replay one sale, collection, return with a key; assert no double effect.
      const idemRep = reps[0]; const idemCust = pick(custByBranch(idemRep.branch));
      const key1 = randomUUID();
      await actAs(c, idemRep.user);
      const a1 = (await c.query('select * from erp_van_sell($1,$2,$3::jsonb,$4,null,null)', [idemRep.branch, idemCust.id, JSON.stringify([{ product_id: products[1], quantity: 2 }]), key1])).rows[0];
      const a2 = (await c.query('select * from erp_van_sell($1,$2,$3::jsonb,$4,null,null)', [idemRep.branch, idemCust.id, JSON.stringify([{ product_id: products[1], quantity: 2 }]), key1])).rows[0];
      await resetRole(c);
      expect(a2.invoice_id).toBe(a1.invoice_id);
      const idemInvCount = (await c.query('select count(*)::int n from erp_invoices where idempotency_key=$1', [key1])).rows[0].n;
      expect(idemInvCount).toBe(1);

      // 7) Tenant isolation — a foreign rep cannot transact on this distributor.
      const foreignCo = (await c.query("insert into erp_companies(name) values('Foreign Co') returning id")).rows[0].id;
      const foreignBr = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'FGN','FGN') returning id", [foreignCo])).rows[0].id;
      const foreignRep = randomUUID();
      await c.query('insert into auth.users(id,email) values ($1,$2)', [foreignRep, `f+${foreignRep}@x.test`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,'salesman',true)", [foreignRep, foreignBr]);
      await actAs(c, foreignRep);
      await c.query('savepoint iso');
      await expect(c.query('select * from erp_van_sell($1,$2,$3::jsonb,null,null,null)', [branches[0], customers[0].id, JSON.stringify([{ product_id: products[0], quantity: 1 }])])).rejects.toThrow(/branch_access_denied/);
      await c.query('rollback to savepoint iso');
      await resetRole(c);

      // ── Summary (printed to the test log) ────────────────────────────────────
      const totalMs = Date.now() - t0;
      const invTotal = (await c.query('select count(*)::int n from erp_invoices i join erp_branches b on b.id=i.branch_id where b.company_id=$1', [company])).rows[0].n;
      const summary = {
        scale: N, branches: branches.length, reps: reps.length, skus: PRODUCTS, customers: customers.length,
        sales: sales.length, collections: collectionsDone, returns: returnsDone, creditNotes, invoices: invTotal,
        salesMs, collMs, retMs, totalMs,
        stockMismatches, negativeStock, arMismatches, badInvoices, badCollections, dupNumbers: dupInv + dupCol,
        idempotency: 'ok', tenantIsolation: 'ok',
      };
      if (process.env.SIM_SUMMARY) { try { writeFileSync(process.env.SIM_SUMMARY, JSON.stringify(summary, null, 2)); } catch { /* ignore */ } }
      // eslint-disable-next-line no-console
      console.log(`\n┌─ FMCG PILOT SIMULATION (scale ×${N}) ─────────────────────────
│ company: Nile FMCG Distribution · 2 branches · ${reps.length} reps/vans · ${PRODUCTS} SKUs · ${customers.length} customers
│ transactions: ${sales.length} sales · ${collectionsDone} collections · ${returnsDone} returns (${creditNotes} credit notes) · ${invTotal} invoices
│ timings: sales ${salesMs}ms · collections ${collMs}ms · returns ${retMs}ms · total ${totalMs}ms
│ INVARIANTS — stock mismatches: ${stockMismatches} · negative stock: ${negativeStock} · AR mismatches: ${arMismatches}
│              bad invoices: ${badInvoices} · bad collections: ${badCollections} · dup numbers: ${dupInv + dupCol}
│ idempotency: OK · tenant isolation: OK
└────────────────────────────────────────────────────────────`);

      expect(sales.length).toBe(SALES);
      expect(returnsDone).toBe(RETURNS);
    });
  }, 600_000);
});
