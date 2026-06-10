import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';
import { evaluatePilotReadiness, type ReadinessFacts } from '@/lib/van-sales/pilot-readiness';

/**
 * SUPERVISED PILOT DRY-RUN — provisions a realistic demo distributor tenant and
 * walks the EXACT operator sequence on the real RPCs, asserting each step + the
 * named validations. This is the executable rehearsal of the human dry-run:
 *
 *   readiness ✔ → open day → confirm load → visit → sell → invoice → (print)
 *   → collect → (receipt) → return → credit note → (print) → reconcile → close day
 *
 * Validates: stock accuracy · balance accuracy · invoice numbering · collection
 * allocation · credit-note linkage · reconciliation (run by the warehouse keeper,
 * the role with DB reconciliation.manage) · document data (print readiness).
 * Rolled back. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('FMCG pilot — supervised dry-run on a demo tenant', () => {
  it('provisions a demo distributor, passes readiness, and completes the full day', async () => {
    await withRollback(async (c) => {
      const sfx = randomUUID().slice(0, 6);

      // ── PROVISION THE DEMO TENANT ────────────────────────────────────────────
      const company = (await c.query("insert into erp_companies(name, currency, country) values('Nile FMCG Distribution Co.','EGP','EG') returning id")).rows[0].id;
      await c.query('insert into erp_van_sales_settings(company_id,is_enabled,discount_cap_pct,allow_negative_van_stock,require_physical_count_on_close) values ($1,true,15,false,true)', [company]);
      await c.query('insert into erp_fmcg_settings(company_id) values ($1) on conflict do nothing', [company]);
      const reason = (await c.query("insert into erp_return_reasons(company_id,code,label_en,label_ar) values ($1,'damaged','Damaged','تالف') returning id", [company])).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'CAI','Cairo HQ') returning id", [company])).rows[0].id;
      await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,$2,'Main Warehouse')", [branch, `WH-${sfx}`]);

      // Four users with the pilot roles.
      const mkUser = async (role: string) => {
        const u = randomUUID();
        await c.query('insert into auth.users(id,email) values ($1,$2)', [u, `${role}+${u}@nile.test`]);
        await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [u, branch, role]);
        return u;
      };
      const admin = await mkUser('admin');
      const supervisor = await mkUser('supervisor');
      const warehouseKeeper = await mkUser('warehouse_keeper');
      const rep = await mkUser('salesman');
      void admin; void supervisor;

      // The rep's van (assigned), plus a confirmed load of 8 SKUs.
      const van = (await c.query("insert into erp_warehouses(branch_id,code,name,is_van,assigned_to) values ($1,$2,'Rep Van',true,$3) returning id", [branch, `VAN-${sfx}`, rep])).rows[0].id;
      const products: string[] = [];
      const LOADED = 200;
      for (let i = 0; i < 8; i++) {
        const p = (await c.query("insert into erp_products_catalog(company_id,code,name,sell_price,tax_rate) values ($1,$2,$3,$4,$5) returning id", [company, `SKU-${sfx}-${i}`, `Demo Product ${i}`, 50 + i * 10, i === 0 ? 14 : 0])).rows[0].id;
        await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,$3)', [van, p, LOADED]);
        products.push(p);
      }

      // 12 approved customers with credit limits + GPS, assigned to the rep.
      const customers: string[] = [];
      for (let i = 0; i < 12; i++) {
        const id = (await c.query(
          "insert into erp_customers(company_id,branch_id,code,name,is_approved,credit_limit,balance,salesman_id,latitude,longitude) values ($1,$2,$3,$4,true,$5,0,$6,30.05,31.24) returning id",
          [company, branch, `C-${sfx}-${i}`, `Demo Customer ${i}`, 5000, rep],
        )).rows[0].id;
        customers.push(id);
      }
      // A customer-scoped promo to exercise server-side pricing.
      await c.query("insert into erp_price_rules(company_id,product_id,scope_type,scope_id,price_type,value,min_qty,is_active) values ($1,$2,'customer',$3,'percent_off',10,1,true)", [company, products[0], customers[0]]);

      const cust = customers[0];

      // ── READINESS DIAGNOSTIC (the in-app check, validated via its pure core) ──
      const facts: ReadinessFacts = {
        vanSalesActive: true,
        salesmenCount: 1,
        vans: [{ assignedTo: rep, stockUnits: LOADED * products.length }],
        salesmenWithoutVan: [],
        productsTotal: products.length,
        zeroPricedProducts: (await c.query("select code from erp_products_catalog where company_id=$1 and is_active and sell_price<=0", [company])).rows.map((r) => r.code),
        multiUomProducts: [],
        customersTotal: customers.length,
        customersApprovedOnBranch: customers.length,
        activeReturnReasons: 1,
        allowNegativeVanStock: false,
        discountCapPct: 15,
      };
      const readiness = evaluatePilotReadiness(facts);
      expect(readiness.ready).toBe(true);
      expect(readiness.blockingFailures).toBe(0);

      // ── 1) OPEN DAY ──────────────────────────────────────────────────────────
      const session = (await c.query("insert into erp_work_sessions(branch_id,salesman_id,status) values ($1,$2,'open') returning id", [branch, rep])).rows[0].id;
      expect((await c.query('select status from erp_work_sessions where id=$1', [session])).rows[0].status).toBe('open');

      // ── 2) CONFIRM VAN LOAD — represented by the loaded van stock ─────────────
      const loaded = new Map(products.map((p) => [p, LOADED]));

      // ── 3) VISIT — check in at the customer ──────────────────────────────────
      await actAs(c, rep);
      const ci = (await c.query('select erp_check_in_visit($1,$2,$3,$4) v', [cust, 30.05, 31.24, session])).rows[0].v;
      await resetRole(c);
      expect(ci.blocked ?? false).toBe(false);
      expect((await c.query('select count(*)::int n from erp_visits where customer_id=$1 and salesman_id=$2', [cust, rep])).rows[0].n).toBe(1);

      // ── 4-5) SELL → ISSUE INVOICE (server-priced) ────────────────────────────
      await actAs(c, rep);
      const sale = (await c.query('select * from erp_van_sell($1,$2,$3::jsonb,null,null,null)', [branch, cust, JSON.stringify([{ product_id: products[0], quantity: 4 }, { product_id: products[1], quantity: 2 }])])).rows[0];
      await resetRole(c);
      const inv = (await c.query('select status, invoice_number, net_amount, paid_amount from erp_invoices where id=$1', [sale.invoice_id])).rows[0];
      expect(inv.status).toBe('issued');
      expect(inv.invoice_number).toMatch(/^INV-CAI-\d{6}$/);          // numbering
      const soldStock = LOADED - 4;                                   // product[0]
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [van, products[0]])).rows[0].quantity)).toBe(soldStock);
      const net = Number(sale.net_amount);
      expect(Number((await c.query('select balance from erp_customers where id=$1', [cust])).rows[0].balance)).toBe(net); // balance accuracy

      // print invoice readiness: the doc's data (invoice + lines + branded company) is queryable.
      const invDoc = (await c.query('select i.invoice_number, co.name, co.logo_url, (select count(*) from erp_invoice_lines l where l.invoice_id=i.id)::int lines from erp_invoices i join erp_branches b on b.id=i.branch_id join erp_companies co on co.id=b.company_id where i.id=$1', [sale.invoice_id])).rows[0];
      expect(invDoc.lines).toBe(2);
      expect(invDoc.name).toBe('Nile FMCG Distribution Co.');

      // ── 6) COLLECT (partial) ─────────────────────────────────────────────────
      await actAs(c, rep);
      const collect = (await c.query("select * from erp_settle_collection($1,$2,$3,'cash',null,null,null,null)", [branch, cust, round2(net * 0.6)])).rows[0];
      await resetRole(c);
      expect(collect.collection_number).toMatch(/^COL-CAI-\d{6}$/);   // numbering
      expect((await c.query('select status from erp_invoices where id=$1', [sale.invoice_id])).rows[0].status).toBe('partially_paid');
      // collection allocation linked to THIS invoice
      const alloc = (await c.query('select invoice_id, applied_amount from erp_collection_allocations where collection_id=$1', [collect.collection_id])).rows;
      expect(alloc.length).toBe(1);
      expect(alloc[0].invoice_id).toBe(sale.invoice_id);
      const balAfterCollect = round2(net - Number(collect.total_applied));
      expect(Number((await c.query('select balance from erp_customers where id=$1', [cust])).rows[0].balance)).toBe(balAfterCollect);

      // print collection receipt readiness: erp_collections + allocations queryable.
      expect(Number((await c.query('select amount from erp_collections where id=$1', [collect.collection_id])).rows[0].amount)).toBeGreaterThan(0);

      // ── 7-8) RETURN + CREDIT NOTE ────────────────────────────────────────────
      await actAs(c, rep);
      const ret = (await c.query('select * from erp_van_return($1,$2,$3::jsonb,$4,$5,$6,null,null)', [branch, cust, JSON.stringify([{ product_id: products[1], quantity: 1 }]), reason, sale.invoice_id, true])).rows[0];
      await resetRole(c);
      expect(ret.return_number).toMatch(/^RET-CAI-\d{6}$/);            // numbering
      expect(ret.credit_note_id).toBeTruthy();
      // credit-note linkage: CN → return + invoice, CN-<return_number>
      const cn = (await c.query('select return_id, invoice_id, credit_note_number, amount, status from erp_credit_notes where id=$1', [ret.credit_note_id])).rows[0];
      expect(cn.return_id).toBe(ret.return_id);
      expect(cn.invoice_id).toBe(sale.invoice_id);
      expect(cn.credit_note_number).toBe(`CN-${ret.return_number}`);
      expect(cn.status).toBe('issued');
      // stock returns to the van (product[1]: 200 − 2 sold + 1 returned = 199)
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [van, products[1]])).rows[0].quantity)).toBe(LOADED - 2 + 1);
      const balAfterReturn = round2(balAfterCollect - Number(ret.total_amount));
      expect(Number((await c.query('select balance from erp_customers where id=$1', [cust])).rows[0].balance)).toBe(balAfterReturn);

      // ── 9) RECONCILE — run by the WAREHOUSE KEEPER (has DB reconciliation.manage)
      // actuals = current live van stock → zero variance for a clean rehearsal.
      const liveStock = (await c.query('select product_id, quantity from erp_inventory_stock where warehouse_id=$1', [van])).rows as { product_id: string; quantity: string }[];
      const actuals = liveStock.map((r) => ({ product_id: r.product_id, actual_qty: Number(r.quantity) }));
      await actAs(c, warehouseKeeper);
      const recon = (await c.query('select erp_compute_van_reconciliation($1,$2::jsonb) r', [session, JSON.stringify(actuals)])).rows[0].r;
      await resetRole(c);
      expect(recon.reconciliation_id).toBeTruthy();
      expect(Number(recon.variance_value)).toBe(0);                   // stock accuracy: live == counted

      // stock conservation: van on-hand == loaded − sold + returned (per SKU)
      const sold = new Map<string, number>([[products[0], 4], [products[1], 2]]);
      const returned = new Map<string, number>([[products[1], 1]]);
      for (const p of products) {
        const exp = (loaded.get(p) ?? 0) - (sold.get(p) ?? 0) + (returned.get(p) ?? 0);
        const got = Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [van, p])).rows[0].quantity);
        expect(got).toBe(exp);
      }

      // ── 10) CLOSE DAY ────────────────────────────────────────────────────────
      await actAs(c, rep);
      const close = (await c.query("select erp_close_day($1,'[]'::jsonb,null) r", [session])).rows[0].r;
      await resetRole(c);
      expect(['closed', 'pending_approval']).toContain(close.close_status ?? close.status ?? 'closed');
      expect((await c.query('select status from erp_work_sessions where id=$1', [session])).rows[0].status).not.toBe('open');
    });
  }, 60_000);
});

function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }
