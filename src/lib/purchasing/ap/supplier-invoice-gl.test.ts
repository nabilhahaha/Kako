import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { postSupplierInvoiceGl } from './supplier-invoice-gl';
import type { PostingGateway, JournalEntryInsert } from '@/lib/finance/posting/gateway';
import type { PostingRule } from '@/lib/finance/posting/types';

function makeGateway(opts?: { unmapped?: Set<string> }) {
  const unmapped = opts?.unmapped ?? new Set<string>();
  const posted = new Set<string>();
  const entries: JournalEntryInsert[] = [];
  const rule: PostingRule = {
    id: 'r-si', companyId: null, sourceEvent: 'supplier.invoice', name: 'Supplier invoice — clear GR-IR to AP',
    priority: 100, isActive: true,
    lines: [
      { side: 'debit', accountKey: 'gr_ir', amountSource: 'total', sortOrder: 0 },
      { side: 'credit', accountKey: 'ap', amountSource: 'total', sortOrder: 1 },
    ],
  };
  const gw: PostingGateway = {
    async hasEntryFor(t, i) { return posted.has(`${t}:${i}`); },
    async loadRules(ev) { return ev === 'supplier.invoice' ? [rule] : []; },
    async resolveAccountIds(_c, keys) {
      const out: Record<string, string> = {};
      for (const k of keys) if (!unmapped.has(k)) out[k] = `acc-${k}`;
      return out;
    },
    async insertPostedEntry(e) { entries.push(e); posted.add(`${e.referenceType}:${e.referenceId}`); return `je-${entries.length}`; },
  };
  return { gw, entries };
}

describe('supplier-invoice GL orchestrator (AP leg)', () => {
  beforeEach(() => { process.env.KAKO_FINANCE = '1'; });
  afterEach(() => { delete process.env.KAKO_FINANCE; });

  const base = { companyId: 'c1', branchId: 'b1', entryDate: '2026-02-01' };

  it('posts Dr GR-IR / Cr AP under reference_type supplier_invoice', async () => {
    const f = makeGateway();
    const r = await postSupplierInvoiceGl(f.gw, { ...base, amount: 1150, referenceId: 'bill-1' });
    expect(r).toEqual({ posted: true, entryId: 'je-1' });
    const e = f.entries[0];
    expect(e.referenceType).toBe('supplier_invoice');
    expect(e.lines).toEqual([
      { accountId: 'acc-gr_ir', debit: 1150, credit: 0, costCenterId: null },
      { accountId: 'acc-ap', debit: 0, credit: 1150, costCenterId: null },
    ]);
  });

  it('no-op when KAKO_FINANCE off', async () => {
    delete process.env.KAKO_FINANCE;
    const f = makeGateway();
    expect(await postSupplierInvoiceGl(f.gw, { ...base, amount: 100, referenceId: 'bill-1' }))
      .toEqual({ posted: false, reason: 'disabled' });
  });

  it('skips non-positive amounts', async () => {
    const f = makeGateway();
    expect(await postSupplierInvoiceGl(f.gw, { ...base, amount: 0, referenceId: 'bill-1' }))
      .toEqual({ posted: false, reason: 'empty' });
  });

  it('is idempotent on the bill id', async () => {
    const f = makeGateway();
    await postSupplierInvoiceGl(f.gw, { ...base, amount: 100, referenceId: 'bill-1' });
    expect(await postSupplierInvoiceGl(f.gw, { ...base, amount: 100, referenceId: 'bill-1' }))
      .toEqual({ posted: false, reason: 'already_posted' });
    expect(f.entries).toHaveLength(1);
  });

  it('never posts partially when AP account is unmapped', async () => {
    const f = makeGateway({ unmapped: new Set(['ap']) });
    expect(await postSupplierInvoiceGl(f.gw, { ...base, amount: 100, referenceId: 'bill-1' }))
      .toMatchObject({ posted: false, reason: 'unresolved_accounts' });
    expect(f.entries).toHaveLength(0);
  });
});
