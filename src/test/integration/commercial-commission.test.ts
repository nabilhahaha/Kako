import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * CP-4 — Commission Engine.
 * Configurable plans (fixed / percentage / tier) on a commission dimension,
 * value- or quantity-based achievement, qualification gates (min achievement /
 * coverage / execution), fully auditable payouts, frozen per period after
 * approval. Scope-aware ledger.
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
  const company = (await c.query("insert into erp_companies(name) values('CP4') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name, region, area) values($1,$2,'Main','N','A1') returning id", [company, `B${u()}`])).rows[0].id;
  const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)", [admin, `a${u()}@x`, mgrA, `ma${u()}@x`, repA, `ra${u()}@x`, mgrB, `mb${u()}@x`, repB, `rb${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'salesman',true,$3),($4,$2,'salesman',true,$5)", [repA, branch, mgrA, repB, mgrB]);
  const p1 = (await c.query("insert into erp_products_catalog(code,name) values($1,'Cola') returning id", [`SKU${u()}`])).rows[0].id;
  const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, repA])).rows[0].id;
  const cA = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id, route_id) values($1,$2,'CA',$3,$4,$5) returning id", [company, `CA${u()}`, branch, repA, route])).rows[0].id;
  const cB = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id) values($1,$2,'CB',$3,$4) returning id", [company, `CB${u()}`, branch, repB])).rows[0].id;
  await invoiceOn(c, branch, cA, p1, '2026-03-10', 10, 1000);   // repA actual 1000
  await invoiceOn(c, branch, cB, p1, '2026-03-10', 10, 1000);   // repB actual 1000
  return { company, branch, admin, mgrA, repA, mgrB, repB, route, cA, cB, p1 };
}
const M = '2026-03-01';
const find = (rows: { dim_id: string }[], id: string) => rows.find((r) => r.dim_id === id) as any;

describe.skipIf(!hasTestDb)('CP-4 · commission engine', () => {
  it('percentage plan + achievement qualification gate; payouts are auditable; scoped', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000,'active')", [M, s.repA]);   // repA 100%
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',2000,'active')", [M, s.repB]);   // repB 50%
      const plan = (await c.query("select (erp_cp_commission_plan_save('Rep 5%','rep','value','percentage',5,null,90)->>'id') id")).rows[0].id;
      const res = (await c.query("select erp_cp_commission_run($1,$2) j", [plan, M])).rows[0].j;
      expect(res.computed).toBe(2); expect(res.qualified).toBe(1); expect(Number(res.total_payout)).toBe(50);  // only repA (≥90%): 5% of 1000

      const rows = (await c.query("select erp_cp_commission_payouts_list($1) j", [M])).rows[0].j;
      const a = find(rows, s.repA), b = find(rows, s.repB);
      // full audit trail
      expect(Number(a.target)).toBe(1000); expect(Number(a.actual)).toBe(1000); expect(Number(a.achievement_pct)).toBe(100);
      expect(a.qualified).toBe(true); expect(Number(a.payout)).toBe(50); expect(a.rule_applied.rate_pct).toBe(5);
      expect(b.qualified).toBe(false); expect(Number(b.payout)).toBe(0);    // 50% < 90% gate
      await resetRole(c);

      // scope: supervisor A sees only repA's payout
      await actAs(c, s.mgrA);
      const scoped = (await c.query("select erp_cp_commission_payouts_list($1) j", [M])).rows[0].j;
      expect(scoped.length).toBe(1); expect(scoped[0].dim_id).toBe(s.repA);
      await resetRole(c);
    });
  }, 30_000);

  it('tier bands pick the right rate by achievement', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000,'active')", [M, s.repA]);   // 100%
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',2000,'active')", [M, s.repB]);   // 50%
      const plan = (await c.query("select (erp_cp_commission_plan_save('Tiered','rep','value','tier',null,null,0)->>'id') id")).rows[0].id;
      await c.query("select erp_cp_commission_tier_add($1,0,90,2)", [plan]);     // <90% → 2% of value
      await c.query("select erp_cp_commission_tier_add($1,90,null,5)", [plan]);  // ≥90% → 5%
      await c.query("select erp_cp_commission_run($1,$2)", [plan, M]);
      const rows = (await c.query("select erp_cp_commission_payouts_list($1) j", [M])).rows[0].j;
      expect(Number(find(rows, s.repA).payout)).toBe(50);   // 100% → 5% of 1000
      expect(Number(find(rows, s.repB).payout)).toBe(20);   // 50%  → 2% of 1000
      expect(find(rows, s.repA).rule_applied.tier_from).toBe(90);
      await resetRole(c);
    });
  }, 30_000);

  it('fixed plan freezes after approval (re-run refused)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000,'active')", [M, s.repA]);
      const plan = (await c.query("select (erp_cp_commission_plan_save('Bonus','rep','value','fixed',null,200,90)->>'id') id")).rows[0].id;
      await c.query("select erp_cp_commission_run($1,$2)", [plan, M]);
      expect(Number(find((await c.query("select erp_cp_commission_payouts_list($1) j", [M])).rows[0].j, s.repA).payout)).toBe(200);
      // approve → freeze; a second run must refuse
      const ap = (await c.query("select erp_cp_commission_approve($1,$2) j", [plan, M])).rows[0].j;
      expect(ap.frozen).toBe(true); expect(ap.approved).toBeGreaterThanOrEqual(1);
      await rejects(c, "select erp_cp_commission_run($1,$2)", [plan, M], /frozen/);
      expect(find((await c.query("select erp_cp_commission_payouts_list($1) j", [M])).rows[0].j, s.repA).status).toBe('approved');
      await resetRole(c);
    });
  }, 30_000);

  it('rep qualification respects the minimum coverage threshold', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000,'active')", [M, s.repA]);   // 100% achievement
      // repA coverage = 1/2 = 50% in March
      const plan_id = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3,'2026-03-10','published',now()) returning id", [s.company, s.route, s.repA])).rows[0].id;
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status) values($1,$2,$3,1,'visited'),($1,$2,$4,2,'missed')", [s.company, plan_id, s.cA, s.cB]);
      // plan requires ≥80% coverage → repA (50%) is disqualified despite 100% achievement
      const plan = (await c.query("select (erp_cp_commission_plan_save('Gated','rep','value','percentage',5,null,0,80)->>'id') id")).rows[0].id;
      await c.query("select erp_cp_commission_run($1,$2)", [plan, M]);
      const a = find((await c.query("select erp_cp_commission_payouts_list($1,$2) j", [M, plan])).rows[0].j, s.repA);
      expect(a.qualified).toBe(false); expect(Number(a.payout)).toBe(0); expect(Number(a.coverage_pct)).toBe(50);
      await resetRole(c);
    });
  }, 30_000);
});
