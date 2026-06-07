import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { postTradeAccrualGl, postTradeClaimGl } from './gl';
import type { PostingGateway, JournalEntryInsert } from '@/lib/finance/posting/gateway';
import type { PostingRule } from '@/lib/finance/posting/types';

function makeGateway(opts?: { unmapped?: Set<string> }) {
  const unmapped = opts?.unmapped ?? new Set<string>();
  const posted = new Set<string>();
  const entries: JournalEntryInsert[] = [];
  const rules: Record<string, PostingRule> = {
    'trade.accrual': {
      id: 'r-acc', companyId: null, sourceEvent: 'trade.accrual', name: 'Trade spend accrual', priority: 100, isActive: true,
      lines: [
        { side: 'debit', accountKey: 'promo_expense', amountSource: 'total', sortOrder: 0 },
        { side: 'credit', accountKey: 'accrued_trade_spend', amountSource: 'total', sortOrder: 1 },
      ],
    },
    'trade.claim': {
      id: 'r-clm', companyId: null, sourceEvent: 'trade.claim', name: 'Trade spend claim settlement', priority: 100, isActive: true,
      lines: [
        { side: 'debit', accountKey: 'accrued_trade_spend', amountSource: 'total', sortOrder: 0 },
        { side: 'credit', accountKey: 'ar', amountSource: 'total', sortOrder: 1 },
      ],
    },
  };
  const gw: PostingGateway = {
    async hasEntryFor(t, i) { return posted.has(`${t}:${i}`); },
    async loadRules(ev) { return rules[ev] ? [rules[ev]] : []; },
    async resolveAccountIds(_c, keys) { const o: Record<string, string> = {}; for (const k of keys) if (!unmapped.has(k)) o[k] = `acc-${k}`; return o; },
    async insertPostedEntry(e) { entries.push(e); posted.add(`${e.referenceType}:${e.referenceId}`); return `je-${entries.length}`; },
  };
  return { gw, entries };
}

describe('trade-spend GL orchestrators (Augment legs)', () => {
  beforeEach(() => { process.env.KAKO_FINANCE = '1'; });
  afterEach(() => { delete process.env.KAKO_FINANCE; });
  const base = { companyId: 'c1', branchId: 'b1', entryDate: '2026-03-01' };

  it('accrual posts Dr promo expense / Cr accrued trade-spend under trade_accrual', async () => {
    const f = makeGateway();
    const r = await postTradeAccrualGl(f.gw, { ...base, amount: 5000, referenceId: 'acc-1' });
    expect(r).toEqual({ posted: true, entryId: 'je-1' });
    expect(f.entries[0].referenceType).toBe('trade_accrual');
    expect(f.entries[0].lines).toEqual([
      { accountId: 'acc-promo_expense', debit: 5000, credit: 0, costCenterId: null },
      { accountId: 'acc-accrued_trade_spend', debit: 0, credit: 5000, costCenterId: null },
    ]);
  });

  it('claim posts Dr accrued trade-spend / Cr AR under trade_claim', async () => {
    const f = makeGateway();
    const r = await postTradeClaimGl(f.gw, { ...base, amount: 1200, referenceId: 'clm-1' });
    expect(r).toEqual({ posted: true, entryId: 'je-1' });
    expect(f.entries[0].referenceType).toBe('trade_claim');
    expect(f.entries[0].lines).toEqual([
      { accountId: 'acc-accrued_trade_spend', debit: 1200, credit: 0, costCenterId: null },
      { accountId: 'acc-ar', debit: 0, credit: 1200, costCenterId: null },
    ]);
  });

  it('no-op when KAKO_FINANCE off; skips zero; idempotent; no partial on unmapped', async () => {
    delete process.env.KAKO_FINANCE;
    const off = makeGateway();
    expect(await postTradeAccrualGl(off.gw, { ...base, amount: 1, referenceId: 'a' })).toEqual({ posted: false, reason: 'disabled' });

    process.env.KAKO_FINANCE = '1';
    const f = makeGateway();
    expect(await postTradeAccrualGl(f.gw, { ...base, amount: 0, referenceId: 'a' })).toEqual({ posted: false, reason: 'empty' });
    await postTradeClaimGl(f.gw, { ...base, amount: 100, referenceId: 'clm-1' });
    expect(await postTradeClaimGl(f.gw, { ...base, amount: 100, referenceId: 'clm-1' })).toEqual({ posted: false, reason: 'already_posted' });

    const u = makeGateway({ unmapped: new Set(['accrued_trade_spend']) });
    expect(await postTradeAccrualGl(u.gw, { ...base, amount: 100, referenceId: 'a' })).toMatchObject({ posted: false, reason: 'unresolved_accounts' });
    expect(u.entries).toHaveLength(0);
  });
});
