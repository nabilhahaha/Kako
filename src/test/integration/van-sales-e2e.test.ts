import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';
import { loadFulfillment, serviceLevel } from '@/lib/van-sales';

/**
 * Van Sales — END-TO-END demo. Walks the whole loop on real tables/RPCs:
 *   salesman request → supervisor approve+adjust → warehouse load →
 *   salesman confirmation (partial, variance) → ledger posting → reporting.
 * Proves the ledger posts ONLY the accepted qty, the variance is flagged for
 * review, and the reporting core lines up requested/approved/received.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('van-sales · end-to-end demo', () => {
  it('request → approve+adjust → load → confirm → ledger → report', async () => {
    await withRollback(async (c) => {
      const sfx = randomUUID().slice(0, 8);
      const company = (await c.query("insert into erp_companies(name) values('VE2E') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
      const salesman = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [salesman, `s+${salesman}@test.local`]);
      await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [salesman, branch, 'salesman']);

      const src = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,$2,'Src') returning id", [branch, `WH-${sfx}`])).rows[0].id;
      const van = (await c.query("insert into erp_warehouses(branch_id,code,name,is_van,assigned_to) values ($1,$2,'Van',true,$3) returning id", [branch, `VAN-${sfx}`, salesman])).rows[0].id;
      const p1 = (await c.query("insert into erp_products_catalog(company_id,code,name) values ($1,$2,'P1') returning id", [company, `P1-${sfx}`])).rows[0].id;
      await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,100)', [src, p1]);

      // 1) Salesman requests 10.
      const req = (await c.query(
        "insert into erp_stock_requests(request_number,branch_id,from_warehouse_id,to_warehouse_id,status,origin,requested_by) values ($1,$2,$3,$4,'pending','salesman',$5) returning id",
        [`VLR-${sfx}`, branch, src, van, salesman],
      )).rows[0].id;
      await c.query('insert into erp_stock_request_lines(request_id,product_id,quantity) values ($1,$2,10)', [req, p1]);

      // 2) Supervisor approves + adjusts to 8 (the request becomes approved).
      await c.query('update erp_stock_request_lines set approved_qty=8 where request_id=$1 and product_id=$2', [req, p1]);
      await c.query("update erp_stock_requests set status='approved' where id=$1", [req]);

      // 3) Warehouse loads the approved qty onto a manifest.
      const manifest = (await c.query(
        "insert into erp_van_load_manifests(branch_id,warehouse_id,stock_request_id,salesman_id,status) values ($1,$2,$3,$4,'loaded') returning id",
        [branch, van, req, salesman],
      )).rows[0].id;
      await c.query('insert into erp_van_load_manifest_lines(manifest_id,product_id,loaded_qty) values ($1,$2,8)', [manifest, p1]);

      // 4) Salesman confirms — accepts 7 (short 1 → accept_partial, requires review).
      await actAs(c, salesman);
      const conf = (await c.query(
        "select erp_van_confirm_load($1,'accept_partial',true,null,$2::jsonb) as id",
        [manifest, JSON.stringify([{ product_id: p1, loaded_qty: 8, accepted_qty: 7, variance_reason: 'short' }])],
      )).rows[0].id;
      await resetRole(c);

      // 5) Ledger: only the accepted 7 moved src → van.
      const moves = (await c.query("select movement_type, warehouse_id, quantity from erp_stock_movements where reference_type='van_load_confirmation' and reference_id=$1", [conf])).rows;
      expect(moves.length).toBe(2);
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [van, p1])).rows[0].quantity)).toBe(7);
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [src, p1])).rows[0].quantity)).toBe(93);
      const confRow = (await c.query('select status, requires_review, posted_at is not null as posted from erp_van_load_confirmations where id=$1', [conf])).rows[0];
      expect(confRow.status).toBe('accept_partial');
      expect(confRow.requires_review).toBe(true);
      expect(confRow.posted).toBe(true);

      // 6) Reporting: requested 10 → approved 8 → received 7.
      const reqLine = (await c.query('select quantity, approved_qty from erp_stock_request_lines where request_id=$1', [req])).rows[0];
      const confLine = (await c.query('select accepted_qty, loaded_qty from erp_van_load_confirmation_lines where confirmation_id=$1', [conf])).rows[0];
      const rows = loadFulfillment(
        [{ productId: p1, requested: Number(reqLine.quantity), approved: Number(reqLine.approved_qty) }],
        [{ productId: p1, loaded: Number(confLine.loaded_qty), accepted: Number(confLine.accepted_qty) }],
      );
      const sl = serviceLevel(rows);
      expect(sl).toMatchObject({ requestedTotal: 10, approvedTotal: 8, receivedTotal: 7 });
      expect(rows[0].varianceVsRequested).toBe(-3); // got 7 of the 10 asked
    });
  }, 45_000);
});
