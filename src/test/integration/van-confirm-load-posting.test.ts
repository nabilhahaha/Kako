import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Van Sales (0247) — confirming a van load posts ONLY the accepted quantity to
 * van stock (warehouse → van transfer; the ledger trigger maintains on-hand), and
 * is idempotent. Loaded-but-rejected qty never moves. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('van-sales · confirm load posting', () => {
  it('posts accepted qty warehouse→van, leaves rejected qty, and is idempotent', async () => {
    await withRollback(async (c) => {
      const sfx = randomUUID().slice(0, 8);
      const company = (await c.query("insert into erp_companies(name) values('VCL') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const user = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [user, `u+${user}@test.local`]);
      await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, 'salesman']);

      const src = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,$2,'Source') returning id", [branch, `WH-${sfx}`])).rows[0].id;
      const van = (await c.query("insert into erp_warehouses(branch_id,code,name,is_van) values ($1,$2,'Van',true) returning id", [branch, `VAN-${sfx}`])).rows[0].id;
      const p1 = (await c.query("insert into erp_products_catalog(code,name) values ($1,'P1') returning id", [`P1-${sfx}`])).rows[0].id;

      // Source warehouse starts with 100 on hand.
      await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,100)', [src, p1]);

      const sr = (await c.query(
        "insert into erp_stock_requests(request_number,branch_id,from_warehouse_id,to_warehouse_id) values ($1,$2,$3,$4) returning id",
        [`SR-${sfx}`, branch, src, van],
      )).rows[0].id;
      const manifest = (await c.query(
        "insert into erp_van_load_manifests(branch_id,warehouse_id,stock_request_id,status) values ($1,$2,$3,'loaded') returning id",
        [branch, van, sr],
      )).rows[0].id;

      // Loaded 10, salesman accepts 8 (short 2 — never posts to van).
      const conf = (await c.query(
        "insert into erp_van_load_confirmations(company_id,manifest_id,warehouse_id,salesman_id,status,requires_review,review_status) values ($1,$2,$3,$4,'accept_partial',true,'pending') returning id",
        [company, manifest, van, user],
      )).rows[0].id;
      await c.query(
        "insert into erp_van_load_confirmation_lines(company_id,confirmation_id,product_id,loaded_qty,accepted_qty,variance_qty,variance_reason) values ($1,$2,$3,10,8,-2,'short')",
        [company, conf, p1],
      );

      // Post as the salesman (RPC resolves company via auth context).
      await actAs(c, user);
      await c.query('select erp_van_confirm_load($1)', [conf]);
      await resetRole(c);

      const moves = (await c.query(
        "select movement_type, warehouse_id, quantity from erp_stock_movements where reference_type='van_load_confirmation' and reference_id=$1 order by movement_type",
        [conf],
      )).rows;
      expect(moves.length).toBe(2);
      expect(moves.find((m) => m.movement_type === 'transfer_in')).toMatchObject({ warehouse_id: van, quantity: '8.000' });
      expect(moves.find((m) => m.movement_type === 'transfer_out')).toMatchObject({ warehouse_id: src, quantity: '-8.000' });

      const vanOnHand = (await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [van, p1])).rows[0].quantity;
      const srcOnHand = (await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [src, p1])).rows[0].quantity;
      expect(Number(vanOnHand)).toBe(8);   // only accepted qty entered the van
      expect(Number(srcOnHand)).toBe(92);  // 100 - 8 (the rejected 2 stayed)

      // Idempotent: re-posting does nothing (posted_at guard).
      await actAs(c, user);
      await c.query('select erp_van_confirm_load($1)', [conf]);
      await resetRole(c);
      const count = (await c.query("select count(*)::int n from erp_stock_movements where reference_type='van_load_confirmation' and reference_id=$1", [conf])).rows[0].n;
      expect(count).toBe(2);
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [van, p1])).rows[0].quantity)).toBe(8);
    });
  }, 30_000);
});
