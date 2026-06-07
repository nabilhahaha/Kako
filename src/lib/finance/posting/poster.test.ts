import { describe, it, expect, vi, afterEach } from 'vitest';
import { postFromEvent } from './poster';
import type { PostingGateway, JournalEntryInsert } from './gateway';
import type { PostingRule } from './types';

const arRule: PostingRule = {
  id: 'r1', companyId: 'co-1', sourceEvent: 'invoice.issued', name: 'Sales invoice',
  condition: {}, priority: 100, isActive: true,
  lines: [
    { side: 'debit', accountKey: 'ar', amountSource: 'total' },
    { side: 'credit', accountKey: 'revenue_sales', amountSource: 'net' },
    { side: 'credit', accountKey: 'output_tax', amountSource: 'tax' },
  ],
};

function fakeGateway(over: Partial<PostingGateway> = {}): { gw: PostingGateway; inserted: JournalEntryInsert[] } {
  const inserted: JournalEntryInsert[] = [];
  const gw: PostingGateway = {
    hasEntryFor: vi.fn(async () => false),
    loadRules: vi.fn(async () => [arRule]),
    resolveAccountIds: vi.fn(async (_c: string, keys: string[]) => Object.fromEntries(keys.map((k) => [k, `acct-${k}`]))),
    insertPostedEntry: vi.fn(async (e) => { inserted.push(e); return 'entry-1'; }),
    ...over,
  };
  return { gw, inserted };
}

const input = {
  sourceEvent: 'invoice.issued', referenceType: 'invoice', referenceId: 'inv-1',
  companyId: 'co-1', branchId: 'br-1', entryDate: '2026-06-07',
  context: { amounts: { total: 115, net: 100, tax: 15 } },
};

const saved = process.env.KAKO_FINANCE;
afterEach(() => { if (saved === undefined) delete process.env.KAKO_FINANCE; else process.env.KAKO_FINANCE = saved; });

describe('finance poster (data-integrity invariants)', () => {
  it('no-op when KAKO_FINANCE is OFF (never posts)', async () => {
    delete process.env.KAKO_FINANCE;
    const { gw, inserted } = fakeGateway();
    expect(await postFromEvent(gw, input)).toEqual({ posted: false, reason: 'disabled' });
    expect(gw.loadRules).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(0);
  });

  describe('with KAKO_FINANCE on', () => {
    afterEach(() => { /* per-test set below */ });

    it('posts a balanced entry with resolved account ids', async () => {
      process.env.KAKO_FINANCE = '1';
      const { gw, inserted } = fakeGateway();
      const res = await postFromEvent(gw, input);
      expect(res).toEqual({ posted: true, entryId: 'entry-1' });
      expect(inserted).toHaveLength(1);
      const e = inserted[0];
      expect(e.referenceType).toBe('invoice');
      expect(e.lines.map((l) => l.accountId)).toEqual(['acct-ar', 'acct-revenue_sales', 'acct-output_tax']);
      const debit = e.lines.reduce((s, l) => s + l.debit, 0);
      const credit = e.lines.reduce((s, l) => s + l.credit, 0);
      expect(debit).toBe(115);
      expect(credit).toBe(115);
    });

    it('does NOT double-post (idempotency)', async () => {
      process.env.KAKO_FINANCE = '1';
      const { gw, inserted } = fakeGateway({ hasEntryFor: vi.fn(async () => true) });
      expect(await postFromEvent(gw, input)).toEqual({ posted: false, reason: 'already_posted' });
      expect(inserted).toHaveLength(0);
    });

    it('skips when no rule matches', async () => {
      process.env.KAKO_FINANCE = '1';
      const { gw, inserted } = fakeGateway({ loadRules: vi.fn(async () => []) });
      expect(await postFromEvent(gw, input)).toEqual({ posted: false, reason: 'no_rule' });
      expect(inserted).toHaveLength(0);
    });

    it('aborts (no partial entry) when an account key is unresolved', async () => {
      process.env.KAKO_FINANCE = '1';
      const { gw, inserted } = fakeGateway({
        resolveAccountIds: vi.fn(async () => ({ ar: 'acct-ar', revenue_sales: 'acct-rev' })), // missing output_tax
      });
      const res = await postFromEvent(gw, input);
      expect(res).toMatchObject({ posted: false, reason: 'unresolved_accounts' });
      expect(inserted).toHaveLength(0);
    });

    it('throws rather than post an unbalanced entry (bad rule)', async () => {
      process.env.KAKO_FINANCE = '1';
      const badRule: PostingRule = { ...arRule, lines: [
        { side: 'debit', accountKey: 'ar', amountSource: 'total' },
        { side: 'credit', accountKey: 'revenue_sales', amountSource: 'net' }, // missing tax credit
      ]};
      const { gw, inserted } = fakeGateway({ loadRules: vi.fn(async () => [badRule]) });
      await expect(postFromEvent(gw, input)).rejects.toThrow(/unbalanced/i);
      expect(inserted).toHaveLength(0);
    });
  });
});
