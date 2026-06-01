import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * PR-3 — ERP round-trip ingestion.
 * Idempotent upsert-by-external_id for customers / products / invoices,
 * source_wins conflict policy, mapping + result audit with ERP source tracking,
 * and dashboard counts. Repeated syncs never duplicate.
 */
const u = () => randomUUID().slice(0, 8);
const ingest = (entity: string, rows: unknown[], source = 'rest', erp = 'odoo') =>
  `select erp_sync_ingest('${entity}','${JSON.stringify(rows).replace(/'/g, "''")}'::jsonb,'${source}','${erp}') j`;

async function seed(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('ERP') returning id")).rows[0].id;
  const bcode = `B${u()}`;
  const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,$2,'Main') returning id", [company, bcode])).rows[0].id;
  const admin = randomUUID(), mgr = randomUUID();
  await c.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [admin, `a${u()}@x`, mgr, `m${u()}@x`]);
  await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'supervisor',true)", [admin, branch, mgr]);
  return { company, branch, bcode, admin, mgr };
}

describe.skipIf(!hasTestDb)('PR-3 · ERP sync ingestion', () => {
  it('idempotent round-trip for customer/product/invoice + source_wins + audit + dashboard', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);

      // CUSTOMER create → update (source_wins) → no duplicate
      let r = (await c.query(ingest('customer', [{ external_id: 'C-1', code: 'CUST1', name: 'Acme', channel: 'retail', classification: 'A', branch: s.bcode }]))).rows[0].j;
      expect(r.created).toBe(1);
      r = (await c.query(ingest('customer', [{ external_id: 'C-1', name: 'Acme Renamed', channel: 'wholesale' }]))).rows[0].j;
      expect(r.updated).toBe(1); expect(r.created).toBe(0);
      const cust = (await c.query("select id, name, channel, external_id from erp_customers where company_id=$1 and external_id='C-1'", [s.company])).rows;
      expect(cust.length).toBe(1);                              // no duplicate
      expect(cust[0].name).toBe('Acme Renamed'); expect(cust[0].channel).toBe('wholesale');  // source_wins

      // PRODUCT with category / subcategory / brand / sku
      r = (await c.query(ingest('product', [{ external_id: 'P-1', code: 'SKU-1', name: 'Cola', category: `BEV${u()}`, subcategory: `SODA${u()}`, brand: 'Cola Co' }]))).rows[0].j;
      expect(r.created).toBe(1);
      const prod = (await c.query("select p.id, p.code, p.brand, sc.parent_id from erp_products_catalog p left join erp_product_categories sc on sc.id=p.category_id where p.company_id=$1 and p.external_id='P-1'", [s.company])).rows[0];
      expect(prod.code).toBe('SKU-1'); expect(prod.brand).toBe('Cola Co'); expect(prod.parent_id).not.toBeNull();  // category_id = subcategory (has a parent)

      // INVOICE create → status change to cancelled (update) → no duplicate
      r = (await c.query(ingest('invoice', [{ external_id: 'INV-1', invoice_number: 'INV-1', branch: s.bcode, customer: 'C-1', status: 'issued', net_amount: 1000, lines: [{ product: 'P-1', qty: 10, unit_price: 100, line_total: 1000 }] }]))).rows[0].j;
      expect(r.created).toBe(1);
      expect((await c.query("select count(*)::int n from erp_invoice_lines il join erp_invoices i on i.id=il.invoice_id where i.external_id='INV-1'")).rows[0].n).toBe(1);
      r = (await c.query(ingest('invoice', [{ external_id: 'INV-1', branch: s.bcode, customer: 'C-1', status: 'cancelled', net_amount: 0, lines: [] }]))).rows[0].j;
      expect(r.updated).toBe(1);
      const inv = (await c.query("select status::text, external_id from erp_invoices where external_id='INV-1'")).rows;
      expect(inv.length).toBe(1); expect(inv[0].status).toBe('cancelled');   // status change + no dup
      expect((await c.query("select count(*)::int n from erp_invoice_lines il join erp_invoices i on i.id=il.invoice_id where i.external_id='INV-1'")).rows[0].n).toBe(0);  // lines replaced

      // SYNC AUDIT + ERP source tracking
      const map = (await c.query("select external_id, internal_id, erp_system, source, created_via_sync, updated_via_sync, last_result, last_synced_at from erp_sync_map where company_id=$1 and entity='customer' and external_id='C-1'", [s.company])).rows[0];
      expect(map.internal_id).toBe(cust[0].id); expect(map.erp_system).toBe('odoo'); expect(map.source).toBe('rest');
      expect(map.created_via_sync).toBe(true); expect(map.updated_via_sync).toBe(true); expect(map.last_result).toBe('updated'); expect(map.last_synced_at).not.toBeNull();

      // DASHBOARD
      const dash = (await c.query("select erp_sync_dashboard() j")).rows[0].j as { entity: string; mapped: number; errors: number; erp_systems: string[]; last_run: { processed: number } }[];
      const byEntity = Object.fromEntries(dash.map((d) => [d.entity, d]));
      expect(Number(byEntity.customer.mapped)).toBe(1); expect(byEntity.customer.erp_systems).toContain('odoo');
      expect(byEntity.invoice.last_run.processed).toBe(1);
      await resetRole(c);
    });
  }, 30_000);

  it('records per-row errors without aborting the batch; non-admins are denied', async () => {
    await withRollback(async (c) => {
      const s = await seed(c);
      await actAs(c, s.admin);
      // an invoice for an unknown customer → error row, but the valid customer in the same batch still imports
      await c.query(ingest('customer', [{ external_id: 'C-OK', name: 'Good', branch: s.bcode }]));
      const r = (await c.query(ingest('invoice', [{ external_id: 'INV-BAD', branch: s.bcode, customer: 'NOPE', status: 'issued' }]))).rows[0].j;
      expect(r.errors).toBe(1); expect(r.created).toBe(0);
      const err = (await c.query("select last_result, error from erp_sync_map where company_id=$1 and entity='invoice' and external_id='INV-BAD'", [s.company])).rows[0];
      expect(err.last_result).toBe('error'); expect(err.error).toMatch(/unknown customer/);
      await resetRole(c);
      // non-admin cannot ingest
      await actAs(c, s.mgr);
      await c.query('savepoint sp');
      await expect(c.query(ingest('customer', [{ external_id: 'X', name: 'x' }]))).rejects.toThrow(/forbidden/);
      await c.query('rollback to savepoint sp');
      await resetRole(c);
    });
  }, 30_000);
});
