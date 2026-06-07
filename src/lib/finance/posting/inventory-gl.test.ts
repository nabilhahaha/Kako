import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { postCostedMovementGl } from './inventory-gl';
import type { PostingGateway, JournalEntryInsert } from './gateway';
import type { PostingRule } from './types';

// Fake gateway with the two seeded Augment rules; records the posted entry.
function makeGateway(opts?: { posted?: Set<string>; unmappedKeys?: Set<string> }) {
  const posted = opts?.posted ?? new Set<string>();
  const unmapped = opts?.unmappedKeys ?? new Set<string>();
  const entries: JournalEntryInsert[] = [];

  const rules: Record<string, PostingRule> = {
    'goods.received': {
      id: 'r-recv', companyId: null, sourceEvent: 'goods.received', name: 'Goods receipt — inventory at cost',
      priority: 100, isActive: true,
      lines: [
        { side: 'debit', accountKey: 'inventory', amountSource: 'inventory', sortOrder: 0 },
        { side: 'credit', accountKey: 'gr_ir', amountSource: 'inventory', sortOrder: 1 },
      ],
    },
    'invoice.cogs': {
      id: 'r-cogs', companyId: null, sourceEvent: 'invoice.cogs', name: 'Sale — cost of goods sold',
      priority: 100, isActive: true,
      lines: [
        { side: 'debit', accountKey: 'cogs', amountSource: 'cogs', sortOrder: 0 },
        { side: 'credit', accountKey: 'inventory', amountSource: 'cogs', sortOrder: 1 },
      ],
    },
  };

  const gw: PostingGateway = {
    async hasEntryFor(refType, refId) { return posted.has(`${refType}:${refId}`); },
    async loadRules(sourceEvent) { return rules[sourceEvent] ? [rules[sourceEvent]] : []; },
    async resolveAccountIds(_companyId, keys) {
      const out: Record<string, string> = {};
      for (const k of keys) if (!unmapped.has(k)) out[k] = `acc-${k}`;
      return out;
    },
    async insertPostedEntry(entry) {
      entries.push(entry);
      posted.add(`${entry.referenceType}:${entry.referenceId}`);
      return `entry-${entries.length}`;
    },
  };
  return { gw, entries, posted };
}

describe('inventory GL orchestrator (Augment legs)', () => {
  beforeEach(() => { process.env.KAKO_FINANCE = '1'; });
  afterEach(() => { delete process.env.KAKO_FINANCE; });

  const base = { companyId: 'c1', branchId: 'b1', entryDate: '2026-01-31' };

  it('posts the receipt leg: Dr Inventory / Cr GR-IR under reference_type goods_receipt', async () => {
    const f = makeGateway();
    const r = await postCostedMovementGl(f.gw, { ...base, kind: 'receipt', amount: 70, referenceId: 'gr-1' });
    expect(r).toEqual({ posted: true, entryId: 'entry-1' });
    const e = f.entries[0];
    expect(e.referenceType).toBe('goods_receipt');
    expect(e.lines).toEqual([
      { accountId: 'acc-inventory', debit: 70, credit: 0, costCenterId: null },
      { accountId: 'acc-gr_ir', debit: 0, credit: 70, costCenterId: null },
    ]);
  });

  it('posts the COGS leg: Dr COGS / Cr Inventory under reference_type invoice_cogs, branch cost center', async () => {
    const f = makeGateway();
    const r = await postCostedMovementGl(f.gw, { ...base, kind: 'issue', amount: 85, referenceId: 'inv-1' });
    expect(r).toEqual({ posted: true, entryId: 'entry-1' });
    const e = f.entries[0];
    expect(e.referenceType).toBe('invoice_cogs');
    expect(e.lines).toEqual([
      { accountId: 'acc-cogs', debit: 85, credit: 0, costCenterId: null },
      { accountId: 'acc-inventory', debit: 0, credit: 85, costCenterId: null },
    ]);
  });

  it('is a no-op when KAKO_FINANCE is off', async () => {
    delete process.env.KAKO_FINANCE;
    const f = makeGateway();
    const r = await postCostedMovementGl(f.gw, { ...base, kind: 'issue', amount: 85, referenceId: 'inv-1' });
    expect(r).toEqual({ posted: false, reason: 'disabled' });
    expect(f.entries).toHaveLength(0);
  });

  it('never double-posts the same source document (idempotent)', async () => {
    const f = makeGateway();
    await postCostedMovementGl(f.gw, { ...base, kind: 'issue', amount: 85, referenceId: 'inv-1' });
    const again = await postCostedMovementGl(f.gw, { ...base, kind: 'issue', amount: 85, referenceId: 'inv-1' });
    expect(again).toEqual({ posted: false, reason: 'already_posted' });
    expect(f.entries).toHaveLength(1);
  });

  it('skips zero/negative amounts', async () => {
    const f = makeGateway();
    expect(await postCostedMovementGl(f.gw, { ...base, kind: 'issue', amount: 0, referenceId: 'inv-1' }))
      .toEqual({ posted: false, reason: 'empty' });
    expect(await postCostedMovementGl(f.gw, { ...base, kind: 'receipt', amount: -5, referenceId: 'gr-1' }))
      .toEqual({ posted: false, reason: 'empty' });
  });

  it('never posts a partial entry when an account key is unmapped', async () => {
    const f = makeGateway({ unmappedKeys: new Set(['gr_ir']) });
    const r = await postCostedMovementGl(f.gw, { ...base, kind: 'receipt', amount: 70, referenceId: 'gr-1' });
    expect(r).toMatchObject({ posted: false, reason: 'unresolved_accounts' });
    expect(f.entries).toHaveLength(0);
  });
});
