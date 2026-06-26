import { describe, it, expect } from 'vitest';
import { newOfflineSale, markSyncing, markSynced, markFailed, syncable, statusCounts, tempNumber, type OfflineSalePayload } from './offline-queue';

const payload: OfflineSalePayload = {
  mode: 'takeaway', tableId: null, customerName: null, customerPhone: null, customerAddress: null,
  deliveryFee: 0, discountType: 'amount', discountValue: 0, serviceRate: 0, taxRate: 15,
  orderNote: null, paymentMethod: 'cash', items: [{ productId: 'a', name: 'Burger', price: 50, qty: 2 }], capturedTotal: 115,
};
const make = (uuid: string) => newOfflineSale({ localUuid: uuid, tempNumber: 'OFF-1', companyId: 'c1', cashier: 'Sam', createdAt: '2026-06-25T13:30:00Z', sale: payload });

describe('offline-queue — sync status model', () => {
  it('newOfflineSale starts pending_sync with frozen payload', () => {
    const s = make('u1');
    expect(s.status).toBe('pending_sync');
    expect(s.attempts).toBe(0);
    expect(s.sale.items[0].price).toBe(50);
    expect(s.sale.capturedTotal).toBe(115);
  });

  it('status transitions: syncing → synced / failed (immutably)', () => {
    const s0 = make('u1');
    const s1 = markSyncing(s0);
    expect(s1.status).toBe('syncing');
    expect(s1.attempts).toBe(1);
    expect(s0.status).toBe('pending_sync'); // original untouched
    const s2 = markSynced(s1, 'inv1', 'INV-2026-000001');
    expect(s2.status).toBe('synced');
    expect(s2.syncedInvoiceNumber).toBe('INV-2026-000001');
    const f = markFailed(markSyncing(s0), 'server rejected');
    expect(f.status).toBe('sync_failed');
    expect(f.lastError).toBe('server rejected');
  });

  it('syncable returns pending + failed (for retry), preserving order', () => {
    const list = [markSynced(markSyncing(make('a')), 'i', 'n'), make('b'), markFailed(markSyncing(make('c')), 'x')];
    expect(syncable(list).map((s) => s.localUuid)).toEqual(['b', 'c']);
  });

  it('statusCounts tallies each bucket', () => {
    const c = statusCounts([make('a'), markSyncing(make('b')), markSynced(make('c'), 'i', 'n'), markFailed(make('d'), 'e')]);
    expect(c).toEqual({ pending: 1, syncing: 1, synced: 1, failed: 1, total: 4 });
  });

  it('tempNumber is a stable OFF- code from a timestamp', () => {
    expect(tempNumber(1782000000000)).toMatch(/^OFF-[0-9A-Z]+$/);
  });
});
