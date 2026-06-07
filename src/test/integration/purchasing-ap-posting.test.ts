import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs } from '../db';
import { matchLine } from '@/lib/purchasing/matching/three-way-match';
import { ageAp } from '@/lib/purchasing/ap/aging';
import { resolveBalanced } from '@/lib/finance/posting/resolver';
import type { PostingRule, PostingRuleLine } from '@/lib/finance/posting/types';

/**
 * Phase 2 (Purchasing) end-to-end + multi-company integration tests, against the
 * REAL schema: the full PO → GRN → supplier-invoice → 3-way match → AP sub-ledger
 * → AP→GL chain, plus tenant isolation on the AP ledger. The match engine and AP
 * aging are the pure Phase-2 logic; the GL leg uses the seeded 0191 rule resolved
 * by the real resolver and posted via erp_post_journal_entry. Gated on
 * TEST_DATABASE_URL; everything runs inside a rollback.
 */

async function seedProcurement(c: Client) {
  const company = (await c.query("insert into erp_companies(name) values('ITEST_AP') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values($1,'AP','AP') returning id", [company])).rows[0].id;
  const warehouse = (await c.query("insert into erp_warehouses(branch_id,code,name) values($1,'W','W') returning id", [branch])).rows[0].id;
  const supplier = (await c.query("insert into erp_suppliers(company_id,code,name) values($1,'S1','Supplier 1') returning id", [company])).rows[0].id;
  const product = (await c.query("insert into erp_products_catalog(code,name) values($1,'P1') returning id", [`P-${randomUUID().slice(0,8)}`])).rows[0].id;
  return { company, branch, warehouse, supplier, product };
}

async function mapAccounts(c: Client, companyId: string, keys: string[]) {
  const { rows } = await c.query('select code from erp_chart_of_accounts order by code limit $1', [keys.length]);
  expect(rows.length).toBe(keys.length);
  for (let i = 0; i < keys.length; i++) {
    await c.query('insert into erp_account_map(company_id, account_key, account_code) values ($1,$2,$3)', [companyId, keys[i], rows[i].code]);
  }
}

async function loadRule(c: Client, sourceEvent: string): Promise<PostingRule> {
  const r = (await c.query('select id, company_id, source_event, name, priority, is_active from erp_posting_rules where source_event=$1 and company_id is null', [sourceEvent])).rows[0];
  expect(r, `seeded rule ${sourceEvent}`).toBeTruthy();
  const ls = (await c.query('select side, account_key, amount_source, cost_center_source, sort_order from erp_posting_rule_lines where rule_id=$1 order by sort_order', [r.id])).rows;
  const lines: PostingRuleLine[] = ls.map((l) => ({ side: l.side, accountKey: l.account_key, amountSource: l.amount_source, costCenterSource: l.cost_center_source, sortOrder: l.sort_order }));
  return { id: r.id, companyId: r.company_id, sourceEvent: r.source_event, name: r.name, priority: r.priority, isActive: r.is_active, lines };
}

async function accountIds(c: Client, companyId: string, keys: string[]): Promise<Record<string, string>> {
  const { rows } = await c.query(
    `select m.account_key, a.id from erp_account_map m join erp_chart_of_accounts a on a.code=m.account_code where m.company_id=$1 and m.account_key=any($2)`,
    [companyId, keys],
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.account_key] = r.id;
  return out;
}

describe.skipIf(!hasTestDb)('Phase 2 · purchasing PO→GRN→bill→match→AP→GL (end-to-end)', () => {
  it('persists the full procurement chain and the 3-way match reconciles (clean)', async () => {
    await withRollback(async (c) => {
      const { branch, supplier, warehouse, product } = await seedProcurement(c);
      const po = (await c.query("insert into erp_purchase_orders(branch_id,supplier_id,po_number,status) values($1,$2,$3,'received') returning id", [branch, supplier, `PO-${randomUUID().slice(0,8)}`])).rows[0].id;
      const poLine = (await c.query("insert into erp_purchase_order_lines(purchase_order_id,product_id,quantity,unit_price,received_qty) values($1,$2,100,10,100) returning id", [po, product])).rows[0].id;
      const gr = (await c.query("insert into erp_goods_receipts(purchase_order_id,warehouse_id,receipt_number) values($1,$2,$3) returning id", [po, warehouse, `GR-${randomUUID().slice(0,8)}`])).rows[0].id;
      const grLine = (await c.query("insert into erp_goods_receipt_lines(goods_receipt_id,product_id,quantity_received) values($1,$2,100) returning id", [gr, product])).rows[0].id;
      const bill = (await c.query("insert into erp_supplier_invoices(branch_id,supplier_id,purchase_order_id,invoice_number,total_amount) values($1,$2,$3,$4,1000) returning id", [branch, supplier, po, `BILL-${randomUUID().slice(0,8)}`])).rows[0].id;
      const billLine = (await c.query("insert into erp_supplier_invoice_lines(supplier_invoice_id,product_id,po_line_id,gr_line_id,quantity,unit_price,line_total) values($1,$2,$3,$4,100,10,1000) returning id", [bill, product, poLine, grLine])).rows[0].id;
      expect(billLine).toBeTruthy();

      // read the three corners back and run the real match engine
      const poRow = (await c.query('select quantity, unit_price from erp_purchase_order_lines where id=$1', [poLine])).rows[0];
      const grRow = (await c.query('select quantity_received from erp_goods_receipt_lines where id=$1', [grLine])).rows[0];
      const biRow = (await c.query('select quantity, unit_price from erp_supplier_invoice_lines where id=$1', [billLine])).rows[0];
      const m = matchLine({
        orderedQty: Number(poRow.quantity), poUnitPrice: Number(poRow.unit_price),
        receivedQty: Number(grRow.quantity_received),
        invoicedQty: Number(biRow.quantity), invoiceUnitPrice: Number(biRow.unit_price),
      });
      expect(m).toMatchObject({ matched: true, flags: [] });
    });
  }, 30_000);

  it('partial receipt → over-billed; partial invoice → under-billed (advisory)', async () => {
    // over-billed: received 60, invoiced 100
    expect(matchLine({ orderedQty: 100, poUnitPrice: 10, receivedQty: 60, invoicedQty: 100, invoiceUnitPrice: 10 }))
      .toMatchObject({ matched: false, flags: ['over_billed'] });
    // under-billed: received 100, invoiced 60 (a partial bill) — allowed
    expect(matchLine({ orderedQty: 100, poUnitPrice: 10, receivedQty: 100, invoicedQty: 60, invoiceUnitPrice: 10 }))
      .toMatchObject({ matched: true, flags: ['under_billed'] });
  });

  it('AP→GL: supplier.invoice rule posts Dr GR-IR / Cr AP balanced under supplier_invoice', async () => {
    await withRollback(async (c) => {
      const { company, branch } = await seedProcurement(c);
      await mapAccounts(c, company, ['gr_ir', 'ap']);
      const rule = await loadRule(c, 'supplier.invoice');
      const lines = resolveBalanced(rule, { amounts: { total: 1000 } });
      const ids = await accountIds(c, company, lines.map((l) => l.accountKey));
      const payload = JSON.stringify(lines.map((l) => ({ account_id: ids[l.accountKey], debit: l.debit, credit: l.credit })));
      const entry = (await c.query("select erp_post_journal_entry($1, current_date, 'bill', 'supplier_invoice', gen_random_uuid(), $2::jsonb) as e", [branch, payload])).rows[0].e;
      const ls = (await c.query('select debit, credit from erp_journal_lines where journal_entry_id=$1 order by debit desc', [entry])).rows;
      expect(ls).toHaveLength(2);
      expect(Number(ls[0].debit)).toBe(1000);   // Dr GR-IR
      expect(Number(ls[1].credit)).toBe(1000);  // Cr AP
      const e = (await c.query('select reference_type from erp_journal_entries where id=$1', [entry])).rows[0];
      expect(e.reference_type).toBe('supplier_invoice');
    });
  }, 30_000);

  it('AP sub-ledger feeds aging (bill aged, payment netted)', async () => {
    await withRollback(async (c) => {
      const { company, supplier } = await seedProcurement(c);
      await c.query("insert into erp_ap_ledger(company_id,supplier_id,doc_type,doc_date,due_date,amount) values($1,$2,'bill','2026-01-01','2026-01-15',1000)", [company, supplier]);
      await c.query("insert into erp_ap_ledger(company_id,supplier_id,doc_type,doc_date,amount) values($1,$2,'payment','2026-02-01',-400)", [company, supplier]);
      const rows = (await c.query('select amount, due_date, doc_date from erp_ap_ledger where company_id=$1', [company])).rows;
      const aged = ageAp(rows.map((r) => ({ amount: Number(r.amount), dueDate: r.due_date && new Date(r.due_date).toISOString().slice(0,10), docDate: new Date(r.doc_date).toISOString().slice(0,10) })), '2026-03-01');
      expect(aged.total).toBe(600);          // 1000 bill − 400 payment
      expect(aged.d31_60).toBe(1000);        // bill due Jan 15, 45d overdue at Mar 1
    });
  }, 30_000);

  it('multi-company: AP ledger is tenant-isolated (company A cannot see B)', async () => {
    await withRollback(async (c) => {
      // two tenants, each with a branch-scoped user
      const coA = (await c.query("insert into erp_companies(name) values('AP_A') returning id")).rows[0].id;
      const coB = (await c.query("insert into erp_companies(name) values('AP_B') returning id")).rows[0].id;
      const brA = (await c.query("insert into erp_branches(company_id,code,name) values($1,'A','A') returning id", [coA])).rows[0].id;
      const brB = (await c.query("insert into erp_branches(company_id,code,name) values($1,'B','B') returning id", [coB])).rows[0].id;
      const supA = (await c.query("insert into erp_suppliers(company_id,code,name) values($1,'SA','SA') returning id", [coA])).rows[0].id;
      const supB = (await c.query("insert into erp_suppliers(company_id,code,name) values($1,'SB','SB') returning id", [coB])).rows[0].id;
      await c.query("insert into erp_ap_ledger(company_id,supplier_id,doc_type,amount) values($1,$2,'bill',100)", [coA, supA]);
      await c.query("insert into erp_ap_ledger(company_id,supplier_id,doc_type,amount) values($1,$2,'bill',200)", [coB, supB]);
      const userA = randomUUID();
      await c.query('insert into erp_user_branches(user_id,branch_id,is_default) values($1,$2,true)', [userA, brA]);

      await actAs(c, userA);
      const seen = (await c.query('select company_id, amount from erp_ap_ledger')).rows;
      expect(seen.map((r) => r.company_id)).toEqual([coA]);     // only A's row
      expect(Number(seen[0].amount)).toBe(100);
      // cannot write a row for company B (this aborts the tx; withRollback cleans up,
      // and `set local role` is transaction-scoped so no explicit reset is needed)
      await expect(c.query("insert into erp_ap_ledger(company_id,supplier_id,doc_type,amount) values($1,$2,'bill',9)", [coB, supB])).rejects.toThrow();
    });
  }, 30_000);
});
