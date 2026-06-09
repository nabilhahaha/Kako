import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback } from '../db';

/**
 * Critical Alerts — A3b low_stock source (0262). Validates the seeded rule and the
 * source's query columns (products_catalog.min_stock + inventory_stock.quantity,
 * scoped by the product's company). Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('alerts · low_stock', () => {
  it('seeds the low_stock rule', async () => {
    await withRollback(async (c) => {
      const n = (await c.query("select count(*)::int n from erp_alert_rules where company_id is null and rule_key='low_stock'")).rows[0].n;
      expect(n).toBe(1);
    });
  }, 30_000);

  it('detects products below min_stock (column check)', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('ALLS') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const wh = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,$2,'W') returning id", [branch, `W-${randomUUID().slice(0, 6)}`])).rows[0].id;
      const low = (await c.query("insert into erp_products_catalog(company_id,code,name,min_stock) values ($1,$2,'Low',10) returning id", [company, `L-${randomUUID().slice(0, 6)}`])).rows[0].id;
      const ok = (await c.query("insert into erp_products_catalog(company_id,code,name,min_stock) values ($1,$2,'Ok',10) returning id", [company, `K-${randomUUID().slice(0, 6)}`])).rows[0].id;
      await c.query("insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,3)", [wh, low]);   // below 10
      await c.query("insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,50)", [wh, ok]);  // above 10

      // mirrors the source: products with min_stock>0, summed on-hand < min_stock
      const hit = (await c.query(
        `select p.id from erp_products_catalog p
           left join (select product_id, sum(quantity) q from erp_inventory_stock group by product_id) s on s.product_id=p.id
          where p.company_id=$1 and p.min_stock>0 and coalesce(s.q,0) < p.min_stock`,
        [company],
      )).rows.map((r) => r.id);
      expect(hit).toContain(low);
      expect(hit).not.toContain(ok);
    });
  }, 30_000);
});
