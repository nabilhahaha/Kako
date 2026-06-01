import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * CP-3 — performance layer.
 * Per dimension: VALUE and QUANTITY blocks kept separate (never mixed), each with
 * actual / target / achievement % / RAG + prior-period and YoY growth. RAG
 * thresholds configurable per company. Scope mandatory (Effective = Scope AND Filters).
 */

const u = () => randomUUID().slice(0, 8);

async function invoiceOn(c: Client, branch: string, customer: string, product: string, when: string, qty: number, total: number, status = 'issued') {
  const inv = (await c.query("insert into erp_invoices(branch_id, customer_id, invoice_number, status, net_amount, created_at) values($1,$2,$3,$4::erp_invoice_status,$5,$6) returning id",
    [branch, customer, `INV-${u()}`, status, total, when])).rows[0].id;
  await c.query("insert into erp_invoice_lines(invoice_id, product_id, quantity, unit_price, line_total) values($1,$2,$3,$4,$5)", [inv, product, qty, total / qty, total]);
  return inv;
}

async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('CP3') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name, region, area) values($1,$2,'Main','North','A1') returning id", [company, `B${u()}`])).rows[0].id;
  const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)", [admin, `a${u()}@x`, mgrA, `ma${u()}@x`, repA, `ra${u()}@x`, mgrB, `mb${u()}@x`, repB, `rb${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'salesman',true,$3),($4,$2,'salesman',true,$5)", [repA, branch, mgrA, repB, mgrB]);
  const cat = (await c.query("insert into erp_product_categories(code,name) values($1,'Beverages') returning id", [`C${u()}`])).rows[0].id;
  const sub = (await c.query("insert into erp_product_categories(code,name,parent_id) values($1,'Soda',$2) returning id", [`C${u()}`, cat])).rows[0].id;
  const p1 = (await c.query("insert into erp_products_catalog(code,name,category_id,brand) values($1,'Cola',$2,'Cola Co') returning id", [`SKU${u()}`, sub])).rows[0].id;
  const cA = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id) values($1,$2,'CA',$3,$4) returning id", [company, `CA${u()}`, branch, repA])).rows[0].id;
  // current month 1000/10u, prior month 800/8u, same month last year 500/5u
  await invoiceOn(c, branch, cA, p1, '2026-03-10', 10, 1000);
  await invoiceOn(c, branch, cA, p1, '2026-02-10', 8, 800);
  await invoiceOn(c, branch, cA, p1, '2025-03-10', 5, 500);
  return { company, branch, admin, mgrA, repA, mgrB, repB, cat, p1, cA };
}
const M = '2026-03-01';
const find = (rows: { key: string }[], k: string) => rows.find((r) => r.key === k) as any;

describe.skipIf(!hasTestDb)('CP-3 · performance layer', () => {
  it('value & quantity achievement (separate), growth (YoY + prior), and RAG', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1250,'active')", [M, s.repA]);     // 1000/1250 = 80% → red
      await c.query("select erp_cp_target_save($1,'rep',$2,'quantity',8,'active')", [M, s.repA]);      // 10/8 = 125% → green

      const rep = find((await c.query("select erp_cp_performance($1,'rep') j", [M])).rows[0].j, s.repA);
      // value block
      expect(Number(rep.value.actual)).toBe(1000); expect(Number(rep.value.target)).toBe(1250);
      expect(rep.value.achievement).toBe(80); expect(rep.value.rag).toBe('red');
      expect(Number(rep.value.prior)).toBe(800); expect(Number(rep.value.prior_growth)).toBe(25);     // (1000-800)/800
      expect(Number(rep.value.yoy)).toBe(500); expect(Number(rep.value.yoy_growth)).toBe(100);        // (1000-500)/500
      // quantity block — separate, never mixed with value
      expect(Number(rep.qty.actual)).toBe(10); expect(Number(rep.qty.target)).toBe(8);
      expect(rep.qty.achievement).toBe(125); expect(rep.qty.rag).toBe('green');
      expect(Number(rep.qty.yoy_growth)).toBe(100);                                                   // (10-5)/5

      // configurable thresholds: drop amber to 70 → 80% value achievement becomes amber
      await c.query("insert into erp_cp_settings(company_id, rag_amber, rag_green) values($1,70,100)", [s.company]);
      const rep2 = find((await c.query("select erp_cp_performance($1,'rep') j", [M])).rows[0].j, s.repA);
      expect(rep2.value.rag).toBe('amber');
      await resetRole(c);
    });
  }, 30_000);

  it('works across dimensions with drill-through filters; stays scope-aware', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      // category dimension + drill into the category (filter) → SKU view
      const cats = (await c.query("select erp_cp_performance($1,'category') j", [M])).rows[0].j;
      expect(Number(find(cats, s.cat).value.actual)).toBe(1000);
      const skus = (await c.query("select erp_cp_performance($1,'sku',null,null,null,null,null,null,null,$2) j", [M, s.cat])).rows[0].j;
      expect(Number(skus[0].value.actual)).toBe(1000);          // drilled to the category's SKUs
      // company rollup = single row
      const co = (await c.query("select erp_cp_performance($1,'company') j", [M])).rows[0].j;
      expect(co.length).toBe(1); expect(Number(co[0].value.actual)).toBe(1000);
      await resetRole(c);

      // scope: supervisor B (no team sales) sees nothing; supervisor A sees their rep's actuals
      await actAs(c, s.mgrB);
      expect((await c.query("select erp_cp_performance($1,'rep') j", [M])).rows[0].j.length).toBe(0);
      await resetRole(c);
      await actAs(c, s.mgrA);
      const repRows = (await c.query("select erp_cp_performance($1,'rep') j", [M])).rows[0].j;
      expect(repRows.length).toBe(1); expect(repRows[0].key).toBe(s.repA);
      // broad-dim target (category) is admin-only → supervisor sees actual but no target
      await resetRole(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'category',$2,'value',5000,'active')", [M, s.cat]);
      await resetRole(c);
      await actAs(c, s.mgrA);
      const catRow = find((await c.query("select erp_cp_performance($1,'category') j", [M])).rows[0].j, s.cat);
      expect(Number(catRow.value.actual)).toBe(1000); expect(catRow.value.target).toBeNull();  // target out of scope
      await resetRole(c);
    });
  }, 30_000);
});
