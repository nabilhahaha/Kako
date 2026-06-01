import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * TPM-1 — promotion model + performance.
 * Promotions (7 types), multi-dimension audience targeting, lifecycle
 * (draft→approved→active→expired→archived), stored budget/cost/period, and
 * actual performance computed from source-aware sales over the period + audience.
 * Admin-managed; scope-aware visibility.
 */
const u = () => randomUUID().slice(0, 8);
async function rejects(c: Client, sql: string, params: unknown[], re: RegExp): Promise<void> {
  await c.query('savepoint sp'); await expect(c.query(sql, params)).rejects.toThrow(re); await c.query('rollback to savepoint sp');
}
async function invoiceOn(c: Client, branch: string, customer: string, product: string, when: string, qty: number, total: number) {
  const inv = (await c.query("insert into erp_invoices(branch_id, customer_id, invoice_number, status, net_amount, created_at) values($1,$2,$3,'issued'::erp_invoice_status,$4,$5) returning id", [branch, customer, `INV-${u()}`, total, when])).rows[0].id;
  await c.query("insert into erp_invoice_lines(invoice_id, product_id, quantity, unit_price, line_total) values($1,$2,$3,$4,$5)", [inv, product, qty, total / qty, total]);
}
async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('TPM') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name, region, area) values($1,$2,'Main','North','A1') returning id", [company, `B${u()}`])).rows[0].id;
  const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)", [admin, `a${u()}@x`, mgrA, `ma${u()}@x`, repA, `ra${u()}@x`, mgrB, `mb${u()}@x`, repB, `rb${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'salesman',true,$3),($4,$2,'salesman',true,$5)", [repA, branch, mgrA, repB, mgrB]);
  const cat = (await c.query("insert into erp_product_categories(code,name) values($1,'Beverages') returning id", [`C${u()}`])).rows[0].id;
  const p1 = (await c.query("insert into erp_products_catalog(code,name,category_id,brand) values($1,'Cola',$2,'Cola Co') returning id", [`SKU${u()}`, cat])).rows[0].id;
  const p2 = (await c.query("insert into erp_products_catalog(code,name,brand) values($1,'Water','Aqua') returning id", [`SKU${u()}`])).rows[0].id;
  const cA = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id, channel) values($1,$2,'CA',$3,$4,'retail') returning id", [company, `CA${u()}`, branch, repA])).rows[0].id;
  const cB = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id, channel) values($1,$2,'CB',$3,$4,'wholesale') returning id", [company, `CB${u()}`, branch, repB])).rows[0].id;
  // March sales: repA/cA Cola 1000 + Water 300; repB/cB Cola 500
  await invoiceOn(c, branch, cA, p1, '2026-03-10', 10, 1000);
  await invoiceOn(c, branch, cA, p2, '2026-03-10', 3, 300);
  await invoiceOn(c, branch, cB, p1, '2026-03-10', 5, 500);
  // outside the promo period (Feb) — must be excluded
  await invoiceOn(c, branch, cA, p1, '2026-02-10', 9, 900);
  return { company, branch, admin, mgrA, repA, mgrB, repB, cat, p1, p2, cA, cB };
}

describe.skipIf(!hasTestDb)('TPM-1 · promotion engine', () => {
  it('lifecycle, audience targeting, and period+audience-scoped actual performance', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const promo = (await c.query("select (erp_tpm_promotion_save('March Cola','percentage','2026-03-01','2026-03-31',5000,1200,$1::jsonb)->>'id') id",
        [JSON.stringify({ discount_pct: 10 })])).rows[0].id;
      // audience: retail channel + the Cola brand
      await c.query("select erp_tpm_target_add($1,'channel','retail')", [promo]);
      await c.query("select erp_tpm_target_add($1,'brand','Cola Co')", [promo]);
      // actuals: only retail-channel Cola in March → cA Cola 1000 (Water excluded by brand, cB excluded by channel, Feb excluded by period)
      const a = (await c.query("select erp_tpm_promotion_actuals($1) j", [promo])).rows[0].j;
      expect(Number(a.actual_value)).toBe(1000); expect(Number(a.actual_qty)).toBe(10);
      expect(Number(a.budget)).toBe(5000); expect(Number(a.cost)).toBe(1200);     // stored mgmt facts
      expect(a.period.from).toContain('2026-03-01');

      // snapshot performance
      await c.query("select erp_tpm_refresh_performance($1)", [promo]);
      expect(Number((await c.query("select actual_value from erp_tpm_promotion_performance where promotion_id=$1", [promo])).rows[0].actual_value)).toBe(1000);

      // lifecycle draft→approved→active→expired→archived
      await c.query("select erp_tpm_set_status($1,'approved')", [promo]);
      expect((await c.query("select approved_by from erp_tpm_promotions where id=$1", [promo])).rows[0].approved_by).toBe(s.admin);
      for (const st of ['active', 'expired', 'archived']) await c.query("select erp_tpm_set_status($1,$2)", [promo, st]);
      expect((await c.query("select status from erp_tpm_promotions where id=$1", [promo])).rows[0].status).toBe('archived');
      await resetRole(c);
    });
  }, 30_000);

  it('write is admin-only; reads are scope-aware', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      // a supervisor cannot create a promotion
      await actAs(c, s.mgrA);
      await rejects(c, "select erp_tpm_promotion_save('x','percentage','2026-03-01','2026-03-31')", [], /forbidden/);
      await resetRole(c);

      // admin creates two promos: one targeted at repA, one company-wide
      await actAs(c, s.admin);
      const pRepA = (await c.query("select (erp_tpm_promotion_save('RepA','fixed_amount','2026-03-01','2026-03-31')->>'id') id")).rows[0].id;
      await c.query("select erp_tpm_target_add($1,'rep',$2)", [pRepA, s.repA]);
      const pAll = (await c.query("select (erp_tpm_promotion_save('All','percentage','2026-03-01','2026-03-31')->>'id') id")).rows[0].id;
      await c.query("select erp_tpm_target_add($1,'company')", [pAll]);
      await resetRole(c);

      // supervisor A sees the company-wide promo + the one targeting their rep
      await actAs(c, s.mgrA);
      const listA = (await c.query("select erp_tpm_promotions_list() j")).rows[0].j as { name: string }[];
      expect(listA.map((p) => p.name).sort()).toEqual(['All', 'RepA']);
      await resetRole(c);
      // supervisor B sees only the company-wide promo (RepA is out of scope)
      await actAs(c, s.mgrB);
      const listB = (await c.query("select erp_tpm_promotions_list() j")).rows[0].j as { name: string }[];
      expect(listB.map((p) => p.name)).toEqual(['All']);
      await resetRole(c);
      // admin sees both
      await actAs(c, s.admin);
      expect((await c.query("select erp_tpm_promotions_list() j")).rows[0].j.length).toBe(2);
      await resetRole(c);
    });
  }, 30_000);
});
