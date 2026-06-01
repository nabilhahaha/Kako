import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * CP-1 — Sales Actuals Integration.
 * A normalized, scope-aware sales-fact stream from recognized invoice lines.
 * erp_cp_actuals aggregates value + quantity by any dimension (rep, category,
 * SKU, channel, classification …), Effective = Scope AND Filters; drafts and
 * cancelled invoices are excluded; reps roll up via the org hierarchy.
 */

const u = () => randomUUID().slice(0, 8);

async function invoice(c: Client, branch: string, customer: string, status: string, lines: { product: string; qty: number; total: number }[]) {
  const inv = (await c.query("insert into erp_invoices(branch_id, customer_id, invoice_number, status, net_amount) values($1,$2,$3,$4::erp_invoice_status,$5) returning id",
    [branch, customer, `INV-${u()}`, status, lines.reduce((s, l) => s + l.total, 0)])).rows[0].id;
  for (const l of lines)
    await c.query("insert into erp_invoice_lines(invoice_id, product_id, quantity, unit_price, line_total) values($1,$2,$3,$4,$5)", [inv, l.product, l.qty, l.total / l.qty, l.total]);
  return inv;
}

async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('CP1') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name, region, area) values($1,$2,'Main','North','A1') returning id", [company, `B${u()}`])).rows[0].id;
  const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)", [admin, `a${u()}@x`, mgrA, `ma${u()}@x`, repA, `ra${u()}@x`, mgrB, `mb${u()}@x`, repB, `rb${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'salesman',true,$3),($4,$2,'salesman',true,$5)", [repA, branch, mgrA, repB, mgrB]);
  // product hierarchy: Beverages → Soda
  const cat = (await c.query("insert into erp_product_categories(code,name) values($1,'Beverages') returning id", [`C${u()}`])).rows[0].id;
  const sub = (await c.query("insert into erp_product_categories(code,name,parent_id) values($1,'Soda',$2) returning id", [`C${u()}`, cat])).rows[0].id;
  const p1 = (await c.query("insert into erp_products_catalog(code,name,category_id) values($1,'Cola',$2) returning id", [`SKU1-${u()}`, sub])).rows[0].id;
  const p2 = (await c.query("insert into erp_products_catalog(code,name,category_id) values($1,'Lemon',$2) returning id", [`SKU2-${u()}`, sub])).rows[0].id;
  const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, repA])).rows[0].id;
  const cA = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id, route_id, channel, classification) values($1,$2,'CA',$3,$4,$5,'retail','A') returning id", [company, `CA${u()}`, branch, repA, route])).rows[0].id;
  const cB = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id, channel, classification) values($1,$2,'CB',$3,$4,'wholesale','B') returning id", [company, `CB${u()}`, branch, repB])).rows[0].id;
  // recognized sales: repA 1500 (Cola 1000/10 + Lemon 500/5); repB 200 (Cola 200/2); + an excluded draft
  await invoice(c, branch, cA, 'issued', [{ product: p1, qty: 10, total: 1000 }, { product: p2, qty: 5, total: 500 }]);
  await invoice(c, branch, cB, 'paid', [{ product: p1, qty: 2, total: 200 }]);
  await invoice(c, branch, cA, 'draft', [{ product: p1, qty: 99, total: 9999 }]);   // must be excluded
  return { company, branch, admin, mgrA, repA, mgrB, repB, route, cat, sub, p1, cA };
}

const FROM = '2000-01-01', TO = '2999-01-01';
const byKey = (rows: { key: string; value: number; qty: number }[]) => Object.fromEntries(rows.map((r) => [r.key, r]));

describe.skipIf(!hasTestDb)('CP-1 · sales actuals integration', () => {
  it('aggregates value + qty by every dimension; excludes draft/cancelled', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const total = (await c.query('select erp_cp_actuals_total($1,$2) j', [FROM, TO])).rows[0].j;
      expect(Number(total.value)).toBe(1700);     // draft 9999 excluded
      expect(Number(total.qty)).toBe(17);
      expect(total.invoices).toBe(2);
      expect(total.customers).toBe(2);

      const reps = byKey((await c.query("select erp_cp_actuals($1,$2,'rep') j", [FROM, TO])).rows[0].j);
      expect(Number(reps[s.repA].value)).toBe(1500); expect(Number(reps[s.repA].qty)).toBe(15);
      expect(Number(reps[s.repB].value)).toBe(200);

      const sku = byKey((await c.query("select erp_cp_actuals($1,$2,'sku') j", [FROM, TO])).rows[0].j);
      // Cola sold to both customers → 1000 + 200
      const cola = Object.values(sku).find((r) => Number(r.value) === 1200);
      expect(cola).toBeDefined(); expect(Number(cola!.qty)).toBe(12);

      const cats = byKey((await c.query("select erp_cp_actuals($1,$2,'category') j", [FROM, TO])).rows[0].j);
      expect(Number(cats[s.cat].value)).toBe(1700);        // Beverages (parent) rolls up everything
      const subs = byKey((await c.query("select erp_cp_actuals($1,$2,'subcategory') j", [FROM, TO])).rows[0].j);
      expect(Number(subs[s.sub].value)).toBe(1700);

      const ch = byKey((await c.query("select erp_cp_actuals($1,$2,'channel') j", [FROM, TO])).rows[0].j);
      expect(Number(ch['retail'].value)).toBe(1500); expect(Number(ch['wholesale'].value)).toBe(200);
      const cls = byKey((await c.query("select erp_cp_actuals($1,$2,'classification') j", [FROM, TO])).rows[0].j);
      expect(Number(cls['A'].value)).toBe(1500); expect(Number(cls['B'].value)).toBe(200);
      await resetRole(c);
    });
  }, 30_000);

  it('is scope-aware (Effective = Scope AND Filters)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      // a rep sees only their own actuals
      await actAs(c, s.repA);
      let reps = (await c.query("select erp_cp_actuals($1,$2,'rep') j", [FROM, TO])).rows[0].j;
      expect(reps.length).toBe(1); expect(reps[0].key).toBe(s.repA);
      expect(Number((await c.query('select erp_cp_actuals_total($1,$2) j', [FROM, TO])).rows[0].j.value)).toBe(1500);
      await resetRole(c);
      // a supervisor sees their team only
      await actAs(c, s.mgrB);
      reps = (await c.query("select erp_cp_actuals($1,$2,'rep') j", [FROM, TO])).rows[0].j;
      expect(reps.length).toBe(1); expect(reps[0].key).toBe(s.repB);
      await resetRole(c);
      // admin + filters: classification A only → 1500; channel wholesale only → 200
      await actAs(c, s.admin);
      expect(Number((await c.query("select erp_cp_actuals_total($1,$2,null,null,null,null,null,null,'A') j", [FROM, TO])).rows[0].j.value)).toBe(1500);
      expect(Number((await c.query("select erp_cp_actuals_total($1,$2,null,null,null,null,null,'wholesale') j", [FROM, TO])).rows[0].j.value)).toBe(200);
      await resetRole(c);
    });
  }, 30_000);
});
