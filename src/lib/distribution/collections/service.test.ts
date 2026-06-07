import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { settleCollection } from './service';
import type { SettlementGateway } from './gateway';
import type { OutstandingInvoice } from './allocation';

function makeGateway(outstanding: OutstandingInvoice[]) {
  const applied: Record<string, number> = {};
  let savedAllocations: { invoiceId: string; applied: number }[] = [];
  let header: { id: string; totals?: { applied: number; unapplied: number; status: string } } | null = null;

  const gw: SettlementGateway = {
    async loadOutstandingInvoices() { return outstanding.map((i) => ({ ...i })); },
    async createCollection() { header = { id: 'COL1' }; return 'COL1'; },
    async saveAllocations(_id, allocations) { savedAllocations = allocations.map((a) => ({ ...a })); },
    async applyToInvoice(invoiceId, amt) { applied[invoiceId] = (applied[invoiceId] ?? 0) + amt; },
    async updateCollectionTotals(_id, a, u, status) { if (header) header.totals = { applied: a, unapplied: u, status }; },
  };
  return { gw, applied, get savedAllocations() { return savedAllocations; }, get header() { return header; } };
}

const invs: OutstandingInvoice[] = [
  { id: 'A', outstanding: 100, date: '2026-01-01' },
  { id: 'B', outstanding: 50, date: '2026-02-01' },
];

describe('collection settlement service', () => {
  beforeEach(() => { process.env.KAKO_DISTRIBUTION = '1'; });
  afterEach(() => { delete process.env.KAKO_DISTRIBUTION; });

  const base = { customerId: 'cust1', branchId: 'b1' };

  it('no-op when KAKO_DISTRIBUTION off', async () => {
    delete process.env.KAKO_DISTRIBUTION;
    const f = makeGateway(invs);
    expect(await settleCollection(f.gw, { ...base, amount: 100 })).toEqual({ settled: false, reason: 'disabled' });
  });

  it('rejects a non-positive amount', async () => {
    const f = makeGateway(invs);
    expect(await settleCollection(f.gw, { ...base, amount: 0 })).toEqual({ settled: false, reason: 'invalid_amount' });
  });

  it('settles oldest-first, applies to invoices, records on-account remainder', async () => {
    const f = makeGateway(invs);
    const r = await settleCollection(f.gw, { ...base, amount: 200 }); // total outstanding 150
    expect(r).toMatchObject({ settled: true, collectionId: 'COL1', totalApplied: 150, unapplied: 50, fullySettled: ['A', 'B'] });
    expect(f.applied).toEqual({ A: 100, B: 50 });
    expect(f.savedAllocations).toEqual([{ invoiceId: 'A', applied: 100 }, { invoiceId: 'B', applied: 50 }]);
    expect(f.header?.totals).toEqual({ applied: 150, unapplied: 50, status: 'settled' });
  });

  it('applies a partial amount to the oldest invoice', async () => {
    const f = makeGateway(invs);
    const r = await settleCollection(f.gw, { ...base, amount: 60 });
    expect(f.applied).toEqual({ A: 60 });
    expect(r).toMatchObject({ totalApplied: 60, unapplied: 0, fullySettled: [] });
  });

  it('honours specified per-invoice amounts', async () => {
    const f = makeGateway(invs);
    await settleCollection(f.gw, { ...base, amount: 50, specified: { B: 50 } });
    expect(f.applied).toEqual({ B: 50 });
  });
});
