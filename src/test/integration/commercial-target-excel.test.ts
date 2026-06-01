import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * CX-1 — Target Excel upgrade.
 * Bulk import resolves human-friendly references (customer code / rep email /
 * category code / SKU / brand) to internal dim_ids, company-scoped, and reports
 * unknown references. Multi-dimension (Brand/Category/SKU) supported.
 */
const u = () => randomUUID().slice(0, 8);

describe.skipIf(!hasTestDb)('CX-1 · target excel import (refs)', () => {
  it('resolves dim_ref, validates unknown refs, and imports multi-dimension targets', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('CX1') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, `B${u()}`])).rows[0].id;
      const admin = randomUUID(), rep = randomUUID(); const repEmail = `rep${u()}@x.io`;
      await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a${u()}@x`, rep, repEmail]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'salesman',true)", [admin, branch, rep]);
      const custCode = `CUST${u()}`, catCode = `CAT${u()}`, sku = `SKU${u()}`;
      const cust = (await c.query("insert into erp_customers(company_id, code, name, branch_id, salesman_id) values($1,$2,'Acme',$3,$4) returning id", [company, custCode, branch, rep])).rows[0].id;
      const cat = (await c.query("insert into erp_product_categories(code,name) values($1,'Beverages') returning id", [catCode])).rows[0].id;
      await c.query("insert into erp_products_catalog(code,name,category_id,brand) values($1,'Cola',$2,'Cola Co')", [sku, cat]);

      await actAs(c, admin);
      // resolver
      expect((await c.query("select erp_cp_resolve_dim('customer',$1) v", [custCode])).rows[0].v).toBe(cust);
      expect((await c.query("select erp_cp_resolve_dim('rep',$1) v", [repEmail])).rows[0].v).toBe(rep);
      expect((await c.query("select erp_cp_resolve_dim('category',$1) v", [catCode])).rows[0].v).toBe(cat);
      expect((await c.query("select erp_cp_resolve_dim('sku',$1) v", [sku])).rows[0].v).toBe(sku);
      expect((await c.query("select erp_cp_resolve_dim('brand','Cola Co') v")).rows[0].v).toBe('Cola Co');

      // validate a batch by reference — one unknown customer code errors
      const batch = JSON.stringify([
        { period: '2026-03-01', dim_type: 'customer', dim_ref: custCode, metric: 'value', amount: 1000 },
        { period: '2026-03-01', dim_type: 'customer', dim_ref: 'NOPE', metric: 'value', amount: 1 },
        { period: '2026-03-01', dim_type: 'category', dim_ref: catCode, metric: 'value', amount: 5000 },
        { period: '2026-03-01', dim_type: 'brand', dim_ref: 'Cola Co', metric: 'value', amount: 3000 },
        { period: '2026-03-01', dim_type: 'sku', dim_ref: sku, metric: 'quantity', amount: 50 },
      ]);
      const issues = (await c.query('select erp_cp_targets_validate($1::jsonb) j', [batch])).rows[0].j as { row: number; code: string }[];
      expect(issues.find((i) => i.code === 'unknown_ref')?.row).toBe(2);
      expect(issues.filter((i) => i.code === 'unknown_ref').length).toBe(1);   // only the bad one

      // import refuses while the unknown ref is present
      expect((await c.query("select erp_cp_targets_import($1::jsonb) j", [batch])).rows[0].j.ok).toBe(false);

      // a clean multi-dimension batch imports and resolves ids
      const clean = JSON.stringify([
        { period: '2026-03-01', dim_type: 'customer', dim_ref: custCode, metric: 'value', amount: 1000 },
        { period: '2026-03-01', dim_type: 'category', dim_ref: catCode, metric: 'value', amount: 5000 },
        { period: '2026-03-01', dim_type: 'brand', dim_ref: 'Cola Co', metric: 'value', amount: 3000 },
        { period: '2026-03-01', dim_type: 'sku', dim_ref: sku, metric: 'quantity', amount: 50 },
      ]);
      const imp = (await c.query("select erp_cp_targets_import($1::jsonb,'active') j", [clean])).rows[0].j;
      expect(imp.ok).toBe(true); expect(imp.imported).toBe(4);
      // the customer target stored the resolved UUID; the brand/sku stored literals
      expect((await c.query("select dim_id from erp_cp_targets where dim_type='customer'")).rows[0].dim_id).toBe(cust);
      expect((await c.query("select dim_id from erp_cp_targets where dim_type='brand'")).rows[0].dim_id).toBe('Cola Co');
      expect((await c.query("select dim_id from erp_cp_targets where dim_type='sku'")).rows[0].dim_id).toBe(sku);
      expect((await c.query("select count(*)::int n from erp_cp_targets where dim_type='category' and dim_id=$1", [cat])).rows[0].n).toBe(1);
      await resetRole(c);
    });
  }, 30_000);
});
