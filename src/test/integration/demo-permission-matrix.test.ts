import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Demo permission matrix — verifies the access model across role tiers BEFORE
 * loading the demo dataset. Enforcement is layered: RPC gates
 * (erp_is_company_admin → sees_all) + RLS + scope (erp_fe_team).
 * Tiers: admin (Company Admin / IT Admin), manager (Sales Director / Regional /
 * Area / Branch Manager), supervisor, salesman (Sales Rep), accountant
 * (Finance), viewer (read-only). Platform Owner is the cross-tenant vendor
 * account (super-admin) — out of a single company's scope.
 */
const u = () => randomUUID().slice(0, 8);
async function denied(c: Client, sql: string, params: unknown[]): Promise<void> {
  await c.query('savepoint sp'); await expect(c.query(sql, params)).rejects.toThrow(/forbidden/); await c.query('rollback to savepoint sp');
}
async function invoice(c: Client, branch: string, customer: string, product: string, qty: number, total: number) {
  const inv = (await c.query("insert into erp_invoices(branch_id, customer_id, invoice_number, status, net_amount, created_at) values($1,$2,$3,'issued'::erp_invoice_status,$4, now()) returning id", [branch, customer, `INV-${u()}`, total])).rows[0].id;
  await c.query("insert into erp_invoice_lines(invoice_id, product_id, quantity, unit_price, line_total) values($1,$2,$3,$4,$5)", [inv, product, qty, total / qty, total]);
}
const M = new Date().toISOString().slice(0, 8) + '01';

describe.skipIf(!hasTestDb)('Demo permission matrix', () => {
  it('admin-gated actions, scope visibility, denied actions, and data isolation', async () => {
    await withRollback(async (c) => {
      // ── Company A ──
      const A = (await c.query("insert into erp_companies(name) values('CO-A') returning id")).rows[0].id;
      const bA = (await c.query("insert into erp_branches(company_id, code, name, region) values($1,'A','Main','R') returning id", [A])).rows[0].id;
      const admin = randomUUID(), mgr = randomUUID(), sup = randomUUID(), repA = randomUUID(), sup2 = randomUUID(), repB = randomUUID(), fin = randomUUID(), viewer = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10),($11,$12),($13,$14),($15,$16)",
        [admin,`ad${u()}@x`,mgr,`mg${u()}@x`,sup,`su${u()}@x`,repA,`ra${u()}@x`,sup2,`s2${u()}@x`,repB,`rb${u()}@x`,fin,`fi${u()}@x`,viewer,`vw${u()}@x`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, bA]);
      await c.query(
        `insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to)
         select * from unnest($1::uuid[], $2::uuid[], $3::text[], $4::boolean[], $5::uuid[])`,
        [[mgr, sup, repA, sup2, repB, fin, viewer], [bA, bA, bA, bA, bA, bA, bA],
         ['manager', 'supervisor', 'salesman', 'supervisor', 'salesman', 'accountant', 'viewer'],
         [true, true, true, true, true, true, true], [admin, mgr, sup, admin, sup2, admin, admin]]);
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) select $1, r, 'field_ops:dashboard' from (values ('manager'),('supervisor'),('salesman'),('accountant'),('viewer')) x(r)", [A]);
      const p1 = (await c.query("insert into erp_products_catalog(company_id,code,name) values($1,$2,'P') returning id", [A, `P${u()}`])).rows[0].id;
      const cA = (await c.query("insert into erp_customers(company_id,code,name,branch_id,salesman_id) values($1,$2,'CA',$3,$4) returning id", [A, `CA${u()}`, bA, repA])).rows[0].id;
      const cB = (await c.query("insert into erp_customers(company_id,code,name,branch_id,salesman_id) values($1,$2,'CB',$3,$4) returning id", [A, `CB${u()}`, bA, repB])).rows[0].id;
      await invoice(c, bA, cA, p1, 100, 1000);   // repA actuals 1000
      await invoice(c, bA, cB, p1, 50, 500);      // repB actuals 500

      // ── Company B (isolation) ──
      const B = (await c.query("insert into erp_companies(name) values('CO-B') returning id")).rows[0].id;
      const bB = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [B])).rows[0].id;
      const adminB = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,$2)", [adminB, `adb${u()}@x`]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [adminB, bB]);

      // ── 1) sees_all only for admin ──
      const seesAll = async (uid: string) => { await actAs(c, uid); const v = (await c.query('select erp_fe_sees_all() s')).rows[0].s; await resetRole(c); return v; };
      expect(await seesAll(admin)).toBe(true);
      for (const uid of [mgr, sup, repA, fin, viewer]) expect(await seesAll(uid)).toBe(false);

      // ── 2) admin-gated actions: admin OK; non-admins denied ──
      await actAs(c, admin);
      const plan = (await c.query("select (erp_cp_commission_plan_save('p','rep','value','percentage',5,null,0)->>'id') id")).rows[0].id;
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000,'active')", [M, repA]);
      expect((await c.query("select erp_fe_run_alert_rules() j")).rows[0].j).toBeDefined;
      await c.query("select erp_cp_commission_run($1,$2)", [plan, M]);
      await c.query("select erp_tpm_promotion_save('promo','percentage','2026-01-01','2026-12-31')");
      await c.query("select erp_cfg_change_save('feature_flag','x','x','{\"enabled\":true}'::jsonb)");
      await c.query("select erp_sched_register('fe_alert_detection','Alerts',60)");
      await resetRole(c);
      // a manager (Sales Director / Regional / Area / Branch Manager tier) is NOT an admin
      await actAs(c, mgr);
      await denied(c, "select erp_fe_run_alert_rules()", []);
      await denied(c, "select erp_tpm_promotion_save('p','percentage','2026-01-01','2026-12-31')", []);
      await denied(c, "select erp_cfg_change_save('feature_flag','y','y','{}'::jsonb)", []);
      await denied(c, "select erp_sched_register('k','k',60)", []);
      await denied(c, "select erp_cp_commission_run($1,$2)", [plan, M]);
      await resetRole(c);
      // viewer (read-only) is denied authoring too
      await actAs(c, viewer);
      await denied(c, "select erp_tpm_promotion_save('p','percentage','2026-01-01','2026-12-31')", []);
      await denied(c, "select erp_cfg_change_save('feature_flag','z','z','{}'::jsonb)", []);
      await resetRole(c);

      // ── 3) scope visibility (erp_cp_actuals by rep) ──
      const repKeys = async (uid: string) => { await actAs(c, uid); const rows = (await c.query("select erp_cp_actuals($1,$2,'rep') j", [M, M.slice(0,8)+'28'])).rows[0].j as {key:string}[]; await resetRole(c); return rows.map(r=>r.key).sort(); };
      expect(await repKeys(admin)).toEqual([repA, repB].sort());   // admin: all
      expect(await repKeys(mgr)).toEqual([repA]);                  // manager: own subtree (sup→repA)
      expect(await repKeys(sup)).toEqual([repA]);                  // supervisor: their team
      expect(await repKeys(repA)).toEqual([repA]);                 // rep: self only
      expect(await repKeys(repB)).toEqual([repB]);                 // other rep: self only (not repA)
      expect(await repKeys(viewer)).toEqual([]);                   // viewer: no team sales

      // ── 4) commission/incentive visibility is scoped to own/team ──
      const payoutReps = async (uid: string) => { await actAs(c, uid); const rows = (await c.query("select erp_cp_commission_payouts_list($1) j", [M])).rows[0].j as { dim_id: string }[]; await resetRole(c); return rows.map(r => r.dim_id).sort(); };
      expect(await payoutReps(repA)).toEqual([repA]);             // rep sees only their own payout
      expect(await payoutReps(repB)).toEqual([repB]);             // not repA's
      expect(await payoutReps(admin)).toEqual([repA, repB].sort()); // admin sees all

      // ── 5) DATA ISOLATION: company B admin sees none of company A ──
      await actAs(c, adminB);
      expect(Number((await c.query("select erp_cp_actuals_total($1,$2) j", [M, M.slice(0,8)+'28'])).rows[0].j.value)).toBe(0);
      expect(((await c.query("select erp_tpm_promotions_list() j")).rows[0].j as unknown[]).length).toBe(0);
      expect(((await c.query("select erp_cp_targets_list($1) j", [M])).rows[0].j as unknown[]).length).toBe(0);
      await resetRole(c);
    });
  }, 60_000);
});
