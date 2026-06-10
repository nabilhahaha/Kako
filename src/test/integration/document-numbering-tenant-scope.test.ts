import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback } from '../db';

/**
 * Regression for migration 0268 — tenant-scoped document numbering.
 *
 * Two different tenants may each own a branch with the SAME code (e.g. 'CAI');
 * their per-branch counters both emit identical document numbers
 * (INV-CAI-000001, …). Before 0268 a GLOBAL unique index on the number column
 * made the second tenant's document fail with a duplicate-key error — a
 * functional outage on a shared multi-tenant database. After 0268 the numbers
 * are scoped to their owning branch/warehouse, so tenants coexist; intra-branch
 * duplicates are still rejected.
 */
const d = hasTestDb ? describe : describe.skip;

d('document numbering is tenant-scoped, not global (0268)', () => {
  // Build two tenants, each with a branch coded 'CAI' and the minimal master
  // data needed to insert one of each document type.
  async function twoTenants(c: import('pg').Client) {
    const mk = async (name: string) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', [name])).rows[0].id;
      const br = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'CAI','Cairo') returning id", [co])).rows[0].id;
      const cust = (await c.query('insert into erp_customers(company_id,branch_id,code,name) values ($1,$2,$3,$3) returning id', [co, br, 'C-' + name])).rows[0].id;
      const sup = (await c.query('insert into erp_suppliers(company_id,code,name) values ($1,$2,$2) returning id', [co, 'S-' + name])).rows[0].id;
      const wh = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,'WH','Main') returning id", [br])).rows[0].id;
      const wh2 = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,'WH2','Second') returning id", [br])).rows[0].id;
      const po = (await c.query("insert into erp_purchase_orders(branch_id,supplier_id,po_number) values ($1,$2,$3) returning id", [br, sup, 'PO-CAI-000001'])).rows[0].id;
      return { co, br, cust, sup, wh, wh2, po };
    };
    return { a: await mk('TenantA'), b: await mk('TenantB') };
  }

  it('lets two tenants issue the SAME invoice number from same-coded branches', async () => {
    await withRollback(async (c) => {
      const { a, b } = await twoTenants(c);
      const NUM = 'INV-CAI-000001';
      await c.query('insert into erp_invoices(branch_id,customer_id,invoice_number) values ($1,$2,$3)', [a.br, a.cust, NUM]);
      // Cross-tenant: same number, different branch → must succeed.
      await expect(
        c.query('insert into erp_invoices(branch_id,customer_id,invoice_number) values ($1,$2,$3)', [b.br, b.cust, NUM]),
      ).resolves.toBeDefined();
      // Intra-branch duplicate → must still be rejected.
      await expect(
        c.query('insert into erp_invoices(branch_id,customer_id,invoice_number) values ($1,$2,$3)', [a.br, a.cust, NUM]),
      ).rejects.toThrow(/duplicate key|unique/i);
    });
  });

  it('scopes returns, POs, sales orders and journals to the branch', async () => {
    await withRollback(async (c) => {
      const { a, b } = await twoTenants(c);
      // Same number in same-coded branches of different tenants must coexist.
      // sales_returns + sales_orders need customer_id; purchase_returns needs supplier_id.
      await c.query('insert into erp_sales_returns(branch_id,customer_id,return_number) values ($1,$2,$3)', [a.br, a.cust, 'RET-CAI-000001']);
      await expect(c.query('insert into erp_sales_returns(branch_id,customer_id,return_number) values ($1,$2,$3)', [b.br, b.cust, 'RET-CAI-000001'])).resolves.toBeDefined();

      await c.query('insert into erp_purchase_returns(branch_id,supplier_id,return_number) values ($1,$2,$3)', [a.br, a.sup, 'PRET-CAI-000001']);
      await expect(c.query('insert into erp_purchase_returns(branch_id,supplier_id,return_number) values ($1,$2,$3)', [b.br, b.sup, 'PRET-CAI-000001'])).resolves.toBeDefined();

      await c.query('insert into erp_sales_orders(branch_id,customer_id,order_number) values ($1,$2,$3)', [a.br, a.cust, 'SO-CAI-000001']);
      await expect(c.query('insert into erp_sales_orders(branch_id,customer_id,order_number) values ($1,$2,$3)', [b.br, b.cust, 'SO-CAI-000001'])).resolves.toBeDefined();

      await c.query('insert into erp_journal_entries(branch_id,entry_number) values ($1,$2)', [a.br, 'JV-CAI-000001']);
      await expect(c.query('insert into erp_journal_entries(branch_id,entry_number) values ($1,$2)', [b.br, 'JV-CAI-000001'])).resolves.toBeDefined();
    });
  });

  it('replaced every global document-number index with a tenant-scoped one (structural)', async () => {
    await withRollback(async (c) => {
      // The 12 expected scoped indexes exist…
      const expected = [
        'erp_invoices_invoice_number_scope_key',
        'erp_sales_returns_return_number_scope_key',
        'erp_purchase_orders_po_number_scope_key',
        'erp_purchase_returns_return_number_scope_key',
        'erp_sales_orders_order_number_scope_key',
        'erp_journal_entries_entry_number_scope_key',
        'erp_payment_vouchers_voucher_number_scope_key',
        'erp_receipt_vouchers_voucher_number_scope_key',
        'erp_rma_rma_number_scope_key',
        'erp_goods_receipts_receipt_number_scope_key',
        'erp_transfer_orders_transfer_number_scope_key',
        'erp_collections_collection_number_scope_key',
      ];
      const present = (await c.query(
        `select indexname from pg_indexes where schemaname='public' and indexname = any($1)`, [expected],
      )).rows.map((r) => r.indexname);
      expect(present.sort()).toEqual([...expected].sort());

      // …and NO single-column global *_number unique index remains.
      const leftovers = (await c.query(
        `select indexname from pg_indexes where schemaname='public'
           and indexdef ilike '%UNIQUE%' and indexdef ~ '\\(([a-z_]*_number)\\)'`,
      )).rows.map((r) => r.indexname);
      expect(leftovers).toEqual([]);
    });
  });

  it('scopes goods receipts and transfers to the warehouse', async () => {
    await withRollback(async (c) => {
      const { a, b } = await twoTenants(c);
      // Goods receipts: scoped by warehouse_id.
      await c.query('insert into erp_goods_receipts(purchase_order_id,warehouse_id,receipt_number) values ($1,$2,$3)', [a.po, a.wh, 'GR-CAI-000001']);
      await expect(
        c.query('insert into erp_goods_receipts(purchase_order_id,warehouse_id,receipt_number) values ($1,$2,$3)', [b.po, b.wh, 'GR-CAI-000001']),
      ).resolves.toBeDefined();
      // Transfers: scoped by from_warehouse_id.
      await c.query('insert into erp_transfer_orders(transfer_number,from_warehouse_id,to_warehouse_id) values ($1,$2,$3)', ['TR-CAI-000001', a.wh, a.wh2]);
      await expect(
        c.query('insert into erp_transfer_orders(transfer_number,from_warehouse_id,to_warehouse_id) values ($1,$2,$3)', ['TR-CAI-000001', b.wh, b.wh2]),
      ).resolves.toBeDefined();
    });
  });

  it('adds the previously-missing collections uniqueness guarantee (branch-scoped)', async () => {
    await withRollback(async (c) => {
      const { a, b } = await twoTenants(c);
      const NUM = 'COL-CAI-000001';
      await c.query('insert into erp_collections(branch_id,customer_id,amount,collection_number) values ($1,$2,100,$3)', [a.br, a.cust, NUM]);
      // Cross-tenant: allowed.
      await expect(
        c.query('insert into erp_collections(branch_id,customer_id,amount,collection_number) values ($1,$2,100,$3)', [b.br, b.cust, NUM]),
      ).resolves.toBeDefined();
      // Intra-branch duplicate: now rejected (guarantee added by 0268).
      await expect(
        c.query('insert into erp_collections(branch_id,customer_id,amount,collection_number) values ($1,$2,100,$3)', [a.br, a.cust, NUM]),
      ).rejects.toThrow(/duplicate key|unique/i);
    });
  });
});
