import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { postTaxGl } from './posting';
import type { PostingGateway, JournalEntryInsert } from '@/lib/finance/posting/gateway';
import type { PostingRule } from '@/lib/finance/posting/types';

function makeGateway(opts?: { unmapped?: Set<string> }) {
  const unmapped = opts?.unmapped ?? new Set<string>();
  const posted = new Set<string>();
  const entries: JournalEntryInsert[] = [];
  const rules: Record<string, PostingRule> = {
    'tax.output': { id: 'r-o', companyId: null, sourceEvent: 'tax.output', name: 'Output VAT', priority: 100, isActive: true,
      lines: [{ side: 'debit', accountKey: 'ar', amountSource: 'total', sortOrder: 0 }, { side: 'credit', accountKey: 'output_vat', amountSource: 'total', sortOrder: 1 }] },
    'tax.input': { id: 'r-i', companyId: null, sourceEvent: 'tax.input', name: 'Input VAT', priority: 100, isActive: true,
      lines: [{ side: 'debit', accountKey: 'input_vat', amountSource: 'total', sortOrder: 0 }, { side: 'credit', accountKey: 'ap', amountSource: 'total', sortOrder: 1 }] },
    'tax.adjustment': { id: 'r-a', companyId: null, sourceEvent: 'tax.adjustment', name: 'VAT adjustment (sales note)', priority: 100, isActive: true,
      lines: [{ side: 'debit', accountKey: 'output_vat', amountSource: 'total', sortOrder: 0 }, { side: 'credit', accountKey: 'ar', amountSource: 'total', sortOrder: 1 }] },
  };
  const gw: PostingGateway = {
    async hasEntryFor(t, i) { return posted.has(`${t}:${i}`); },
    async loadRules(ev) { return rules[ev] ? [rules[ev]] : []; },
    async resolveAccountIds(_c, keys) { const o: Record<string, string> = {}; for (const k of keys) if (!unmapped.has(k)) o[k] = `acc-${k}`; return o; },
    async insertPostedEntry(e) { entries.push(e); posted.add(`${e.referenceType}:${e.referenceId}`); return `je-${entries.length}`; },
  };
  return { gw, entries };
}

describe('tax GL posting orchestrator (Augment legs)', () => {
  beforeEach(() => { process.env.KAKO_FINANCE = '1'; });
  afterEach(() => { delete process.env.KAKO_FINANCE; });
  const base = { companyId: 'c1', branchId: 'b1', entryDate: '2026-06-08' };

  it('output VAT: Dr AR / Cr Output VAT under tax_output', async () => {
    const f = makeGateway();
    const r = await postTaxGl(f.gw, { ...base, kind: 'output', amount: 150, referenceId: 'inv-1' });
    expect(r).toEqual({ posted: true, entryId: 'je-1' });
    expect(f.entries[0].referenceType).toBe('tax_output');
    expect(f.entries[0].lines).toEqual([
      { accountId: 'acc-ar', debit: 150, credit: 0, costCenterId: null },
      { accountId: 'acc-output_vat', debit: 0, credit: 150, costCenterId: null },
    ]);
  });

  it('input VAT: Dr Input VAT / Cr AP under tax_input', async () => {
    const f = makeGateway();
    await postTaxGl(f.gw, { ...base, kind: 'input', amount: 60, referenceId: 'bill-1' });
    expect(f.entries[0].referenceType).toBe('tax_input');
    expect(f.entries[0].lines[0]).toMatchObject({ accountId: 'acc-input_vat', debit: 60 });
    expect(f.entries[0].lines[1]).toMatchObject({ accountId: 'acc-ap', credit: 60 });
  });

  it('adjustment: Dr Output VAT / Cr AR under tax_adjustment', async () => {
    const f = makeGateway();
    await postTaxGl(f.gw, { ...base, kind: 'adjustment', amount: 30, referenceId: 'cn-1' });
    expect(f.entries[0].referenceType).toBe('tax_adjustment');
  });

  it('no-op flag off; skip zero; idempotent; no partial on unmapped', async () => {
    delete process.env.KAKO_FINANCE;
    const off = makeGateway();
    expect(await postTaxGl(off.gw, { ...base, kind: 'output', amount: 1, referenceId: 'x' })).toEqual({ posted: false, reason: 'disabled' });

    process.env.KAKO_FINANCE = '1';
    const f = makeGateway();
    expect(await postTaxGl(f.gw, { ...base, kind: 'output', amount: 0, referenceId: 'x' })).toEqual({ posted: false, reason: 'empty' });
    await postTaxGl(f.gw, { ...base, kind: 'output', amount: 150, referenceId: 'inv-1' });
    expect(await postTaxGl(f.gw, { ...base, kind: 'output', amount: 150, referenceId: 'inv-1' })).toEqual({ posted: false, reason: 'already_posted' });

    const u = makeGateway({ unmapped: new Set(['output_vat']) });
    expect(await postTaxGl(u.gw, { ...base, kind: 'output', amount: 150, referenceId: 'y' })).toMatchObject({ posted: false, reason: 'unresolved_accounts' });
    expect(u.entries).toHaveLength(0);
  });
});
