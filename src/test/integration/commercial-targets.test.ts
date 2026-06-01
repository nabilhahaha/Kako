import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * CP-2 — Target Engine.
 * Multi-dimension targets (company→…→SKU incl. Brand), value/quantity, lifecycle
 * (draft→approved→active→archived), manual + import (validated before commit) +
 * export, rollups (product + geo). Scope is mandatory: managers create/edit/view
 * only within their hierarchy; broad dims need admin. Effective = Scope AND Filters.
 */

const u = () => randomUUID().slice(0, 8);
async function rejects(c: Client, sql: string, params: unknown[], re: RegExp): Promise<void> {
  await c.query('savepoint sp'); await expect(c.query(sql, params)).rejects.toThrow(re); await c.query('rollback to savepoint sp');
}

async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('CPT') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id, code, name, region, area) values($1,$2,'Main','North','A1') returning id", [company, `B${u()}`])).rows[0].id;
  const admin = randomUUID(), mgrA = randomUUID(), repA = randomUUID(), mgrB = randomUUID(), repB = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6),($7,$8),($9,$10)", [admin, `a${u()}@x`, mgrA, `ma${u()}@x`, repA, `ra${u()}@x`, mgrB, `mb${u()}@x`, repB, `rb${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'supervisor',true),($3,$2,'supervisor',true)", [mgrA, branch, mgrB]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'salesman',true,$3),($4,$2,'salesman',true,$5)", [repA, branch, mgrA, repB, mgrB]);
  const cat = (await c.query("insert into erp_product_categories(code,name) values($1,'Beverages') returning id", [`C${u()}`])).rows[0].id;
  const sub = (await c.query("insert into erp_product_categories(code,name,parent_id) values($1,'Soda',$2) returning id", [`C${u()}`, cat])).rows[0].id;
  const sku1 = `SKU1-${u()}`, sku2 = `SKU2-${u()}`;
  await c.query("insert into erp_products_catalog(code,name,category_id,brand) values($1,'Cola',$2,'Cola Co'),($3,'Lemon',$4,'Cola Co')", [sku1, sub, sku2, sub]);
  const route = (await c.query("insert into erp_routes(company_id, name, rep_id) values($1,'R1',$2) returning id", [company, repA])).rows[0].id;
  const c1 = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id, route_id) values($1,$2,'C1',$3,$4,$5) returning id", [company, `C1${u()}`, branch, repA, route])).rows[0].id;
  const c2 = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id, route_id) values($1,$2,'C2',$3,$4,$5) returning id", [company, `C2${u()}`, branch, repA, route])).rows[0].id;
  return { company, branch, admin, mgrA, repA, mgrB, repB, cat, sub, sku1, sku2, route, c1, c2 };
}
const M = '2026-03-15';

describe.skipIf(!hasTestDb)('CP-2 · target engine', () => {
  it('manual save upserts (no duplicates) and walks the lifecycle', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      const id = (await c.query("select (erp_cp_target_save($1,'rep',$2,'value',1000)->>'id') id", [M, s.repA])).rows[0].id;
      // saving the same dimension/month/metric updates in place — no duplicate row
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',2000)", [M, s.repA]);
      const rows = (await c.query("select target_amount, status, period_month from erp_cp_targets where dim_type='rep' and dim_id=$1", [s.repA])).rows;
      expect(rows.length).toBe(1);
      expect(Number(rows[0].target_amount)).toBe(2000);
      expect(rows[0].period_month.toISOString().slice(0, 10)).toBe('2026-03-01');   // normalised to month start
      // lifecycle
      await c.query("select erp_cp_target_set_status($1,'approved')", [id]);
      const ap = (await c.query("select status, approved_by from erp_cp_targets where id=$1", [id])).rows[0];
      expect(ap.status).toBe('approved'); expect(ap.approved_by).toBe(s.admin);
      await c.query("select erp_cp_target_set_status($1,'archived')", [id]);
      // once archived the unique index frees up — a fresh active target can be created
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',3000)", [M, s.repA]);
      expect((await c.query("select count(*)::int n from erp_cp_targets where dim_type='rep' and dim_id=$1", [s.repA])).rows[0].n).toBe(2);
      await resetRole(c);
    });
  }, 30_000);

  it('enforces scope: rep/route/customer within team; broad dims need admin', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.mgrA);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',500)", [M, s.repA]);            // own team rep → ok
      await rejects(c, "select erp_cp_target_save($1,'rep',$2,'value',500)", [M, s.repB], /out of scope/); // other team
      await rejects(c, "select erp_cp_target_save($1,'category',$2,'value',500)", [M, s.cat], /out of scope/); // broad dim → admin only
      await c.query("select erp_cp_target_save($1,'customer',$2,'value',300)", [M, s.c1]);          // customer of own rep → ok
      await resetRole(c);
      // admin may set broad dims
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'category',$2,'value',9000)", [M, s.cat]);
      await resetRole(c);
    });
  }, 30_000);

  it('validates an import batch before commit (duplicates, overlaps, scope, shape)', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      await c.query("select erp_cp_target_save($1,'rep',$2,'value',1000)", [M, s.repA]);   // existing
      await c.query("select erp_cp_target_save($1,'company',null,'value',5000)", [M]);      // existing geo-chain level
      const batch = JSON.stringify([
        { period: M, dim_type: 'rep', dim_id: s.repA, metric: 'value', amount: 1500 },     // duplicate of existing
        { period: M, dim_type: 'nope', dim_id: 'x', metric: 'value', amount: 1 },           // bad_dim
        { period: M, dim_type: 'rep', dim_id: s.repB, metric: 'value', amount: 1 },          // overlap (geo chain w/ company)
        { period: M, dim_type: 'sku', dim_id: s.sku1, metric: 'quantity', amount: 10 },      // clean
        { period: M, dim_type: 'sku', dim_id: s.sku1, metric: 'quantity', amount: 11 },      // dup_in_batch
      ]);
      const issues = (await c.query('select erp_cp_targets_validate($1::jsonb) j', [batch])).rows[0].j as { row: number; level: string; code: string }[];
      const codes = Object.fromEntries(issues.map((i) => [i.code, i]));
      expect(codes.duplicate?.level).toBe('error');
      expect(codes.bad_dim?.level).toBe('error');
      expect(codes.dup_in_batch?.level).toBe('error');
      expect(codes.overlap?.level).toBe('warning');
      // import refuses to write anything while errors exist
      const imp = (await c.query("select erp_cp_targets_import($1::jsonb) j", [batch])).rows[0].j;
      expect(imp.ok).toBe(false); expect(imp.imported).toBe(0);
      // a clean batch imports and reports only warnings
      const clean = JSON.stringify([{ period: M, dim_type: 'sku', dim_id: s.sku2, metric: 'value', amount: 700 }]);
      const ok = (await c.query("select erp_cp_targets_import($1::jsonb,'active') j", [clean])).rows[0].j;
      expect(ok.ok).toBe(true); expect(ok.imported).toBe(1);
      expect((await c.query("select status from erp_cp_targets where dim_type='sku' and dim_id=$1", [s.sku2])).rows[0].status).toBe('active');
      await resetRole(c);
    });
  }, 30_000);

  it('list is scope-aware; rollups aggregate up product + geo chains', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      // sku targets (product chain) + customer targets (geo chain)
      await c.query("select erp_cp_target_save($1,'sku',$2,'value',600,'active')", [M, s.sku1]);
      await c.query("select erp_cp_target_save($1,'sku',$2,'value',400,'active')", [M, s.sku2]);
      await c.query("select erp_cp_target_save($1,'customer',$2,'value',300,'active')", [M, s.c1]);
      await c.query("select erp_cp_target_save($1,'customer',$2,'value',200,'active')", [M, s.c2]);
      const prod = (await c.query("select erp_cp_targets_rollup($1,'value','product') j", [M])).rows[0].j;
      expect(Number(prod.total)).toBe(1000);
      expect(prod.by_sku.length).toBe(2);
      expect(prod.by_brand.length).toBe(1);                         // both SKUs share 'Cola Co'
      expect(Number(prod.by_brand[0].target)).toBe(1000);
      expect(Number(prod.by_category[0].target)).toBe(1000);        // rolls to Beverages
      const geo = (await c.query("select erp_cp_targets_rollup($1,'value','geo') j", [M])).rows[0].j;
      expect(Number(geo.total)).toBe(500);
      expect(geo.by_route.length).toBe(1);                          // both customers on R1
      expect(Number(geo.by_route[0].target)).toBe(500);
      expect(Number(geo.by_region[0].target)).toBe(500);            // North
      await resetRole(c);

      // scope: supervisor B sees none of A's team customer targets; A's supervisor sees the customer ones
      await actAs(c, s.mgrB);
      expect((await c.query("select erp_cp_targets_list($1) j", [M])).rows[0].j.length).toBe(0);
      await resetRole(c);
      await actAs(c, s.mgrA);
      const listA = (await c.query("select erp_cp_targets_list($1) j", [M])).rows[0].j as { dim_type: string }[];
      // customer targets (c1,c2 under repA) are visible; broad sku/company are not
      expect(listA.length).toBe(2);
      expect(listA.every((r) => r.dim_type === 'customer')).toBe(true);
      await resetRole(c);
    });
  }, 30_000);
});
