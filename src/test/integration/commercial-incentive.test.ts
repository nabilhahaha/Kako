import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * CP-5 — Incentive Engine (separate from commissions, combinable later).
 * Versioned programs + approval workflow, multi-condition rules (ANDed), fixed +
 * variable payouts, auditable + frozen-after-approval, scope-aware. Combined
 * statement unions commission + incentive per rep.
 */

const u = () => randomUUID().slice(0, 8);
async function rejects(c: Client, sql: string, params: unknown[], re: RegExp): Promise<void> {
  await c.query('savepoint sp'); await expect(c.query(sql, params)).rejects.toThrow(re); await c.query('rollback to savepoint sp');
}
async function invoiceOn(c: Client, branch: string, customer: string, product: string, when: string, qty: number, total: number) {
  const inv = (await c.query("insert into erp_invoices(branch_id, customer_id, invoice_number, status, net_amount, created_at) values($1,$2,$3,'issued'::erp_invoice_status,$4,$5) returning id", [branch, customer, `INV-${u()}`, total, when])).rows[0].id;
  await c.query("insert into erp_invoice_lines(invoice_id, product_id, quantity, unit_price, line_total) values($1,$2,$3,$4,$5)", [inv, product, qty, total / qty, total]);
}
async function merchCap(c: Client, company: string, cust: string, rep: string, when: string) {
  const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
  const sub = (await c.query("insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,'{\"planogram_compliance\":\"yes\"}'::jsonb,'approved') returning id", [company, form, cust, rep])).rows[0].id;
  await c.query("insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by, created_at) values($1,$2,$3,$4,'merchandising',$5,$6)", [company, cust, form, sub, rep, when]);
}
async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('CP5') returning id")).rows[0].id;
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
const find = (rows: { dim_id?: string; rep_id?: string }[], id: string) => rows.find((r) => r.dim_id === id || r.rep_id === id) as any;

describe.skipIf(!hasTestDb)('CP-5 · incentive engine', () => {
  it('program versioning + approval workflow transitions', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const v1 = (await c.query("select (erp_cp_incentive_program_save('Q1 Bonus','category_achievement','rep','value','fixed',500)->>'id') id")).rows[0].id;
      // can't approve before submit
      await rejects(c, "select erp_cp_incentive_set_status($1,'approved')", [v1], /must be submitted/);
      await c.query("select erp_cp_incentive_set_status($1,'submitted')", [v1]);
      await c.query("select erp_cp_incentive_set_status($1,'approved')", [v1]);
      await c.query("select erp_cp_incentive_set_status($1,'active')", [v1]);
      expect((await c.query("select status, is_latest, approved_by from erp_cp_incentive_programs where id=$1", [v1])).rows[0].approved_by).toBe(s.admin);
      // new version carries lineage; activating it demotes v1
      const v2 = (await c.query("select (erp_cp_incentive_new_version($1)->>'id') id", [v1])).rows[0].id;
      await c.query("select erp_cp_incentive_set_status($1,'submitted')", [v2]);
      await c.query("select erp_cp_incentive_set_status($1,'approved')", [v2]);
      await c.query("select erp_cp_incentive_set_status($1,'active')", [v2]);
      expect((await c.query("select is_latest from erp_cp_incentive_programs where id=$1", [v1])).rows[0].is_latest).toBe(false);
      expect((await c.query("select is_latest, version from erp_cp_incentive_programs where id=$1", [v2])).rows[0].version).toBe(2);
      await resetRole(c);
    });
  }, 30_000);

  it('multi-condition rule (achievement≥100 AND coverage≥85 AND execution≥80)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000,'active')", [M, s.repA]);   // achievement 100
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',2000,'active')", [M, s.repB]);   // achievement 50
      // repA coverage 2/2 = 100; execution from a compliant merch capture = 100
      const pl = (await c.query("insert into erp_fe_route_plans(company_id, route_id, rep_id, plan_date, status, published_at) values($1,$2,$3,'2026-03-10','published',now()) returning id", [s.company, s.route, s.repA])).rows[0].id;
      await c.query("insert into erp_fe_route_stops(company_id, plan_id, customer_id, seq, status) values($1,$2,$3,1,'visited'),($1,$2,$4,2,'visited')", [s.company, pl, s.cA, s.cB]);
      await merchCap(c, s.company, s.cA, s.repA, '2026-03-10');
      const conds = JSON.stringify([{ metric: 'achievement', op: '>=', value: 100 }, { metric: 'coverage', op: '>=', value: 85 }, { metric: 'execution', op: '>=', value: 80 }]);
      const prog = (await c.query("select (erp_cp_incentive_program_save('Gold','category_achievement','rep','value','fixed',500,null,null,$1::jsonb)->>'id') id", [conds])).rows[0].id;
      const res = (await c.query("select erp_cp_incentive_run($1,$2) j", [prog, M])).rows[0].j;
      expect(res.qualified).toBe(1); expect(Number(res.total_payout)).toBe(500);
      const rows = (await c.query("select erp_cp_incentive_payouts_list($1) j", [M])).rows[0].j;
      const a = find(rows, s.repA), b = find(rows, s.repB);
      expect(a.conditions_met).toBe(true); expect(Number(a.payout)).toBe(500);
      expect(Number(a.metrics.achievement)).toBe(100); expect(Number(a.metrics.coverage)).toBe(100); expect(Number(a.metrics.execution)).toBe(100);
      expect(b.conditions_met).toBe(false); expect(Number(b.payout)).toBe(0);   // 50% achievement + no coverage/exec
      await resetRole(c);
    });
  }, 30_000);

  it('variable new-customer incentive, freeze, and combined statement with commission', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      // new-customer incentive: $50 per newly-acquired customer this month, no conditions
      const prog = (await c.query("select (erp_cp_incentive_program_save('New Cust','new_customer','rep','value','variable',null,null,50)->>'id') id")).rows[0].id;
      const res = (await c.query("select erp_cp_incentive_run($1,$2) j", [prog, M])).rows[0].j;
      const inc = find((await c.query("select erp_cp_incentive_payouts_list($1) j", [M])).rows[0].j, s.repA);
      expect(Number(inc.metrics.new_customers)).toBe(1); expect(Number(inc.payout)).toBe(50);   // 1 × $50
      // a commission too (5% of 1000 = 50), no gate
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000,'active')", [M, s.repA]);
      const cplan = (await c.query("select (erp_cp_commission_plan_save('5pct','rep','value','percentage',5,null,0)->>'id') id")).rows[0].id;
      await c.query("select erp_cp_commission_run($1,$2)", [cplan, M]);
      // combined statement
      const stmt = find((await c.query("select erp_cp_payout_statement($1) j", [M])).rows[0].j, s.repA);
      expect(Number(stmt.commission)).toBe(50); expect(Number(stmt.incentive)).toBe(50); expect(Number(stmt.total)).toBe(100);
      // freeze incentive period → re-run refused
      await c.query("select erp_cp_incentive_approve($1,$2)", [prog, M]);
      await rejects(c, "select erp_cp_incentive_run($1,$2)", [prog, M], /frozen/);
      await resetRole(c);

      // scope: supervisor A sees only repA's incentive payout
      await actAs(c, s.mgrA);
      const scoped = (await c.query("select erp_cp_incentive_payouts_list($1) j", [M])).rows[0].j;
      expect(scoped.every((r: { dim_id: string }) => r.dim_id === s.repA)).toBe(true);
      await resetRole(c);
    });
  }, 30_000);
});
