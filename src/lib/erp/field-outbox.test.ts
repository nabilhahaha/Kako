import { describe, it, expect } from 'vitest';
import {
  backoffMs, orderForSync, dueItems, reconcile, countByStatus, SYNC_MAX_BACKOFF_MS,
  type OutboxItem,
} from './field-outbox';
import type { SyncItemResult } from './field-sync';

function item(over: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id: 'start:a', kind: 'start', clientRef: 'a',
    action: { kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: '2026-06-01T08:00:00Z' },
    status: 'queued', attempts: 0, nextAttemptAt: 0, createdAt: 1000, ...over,
  };
}

describe('field-outbox · backoffMs', () => {
  it('grows exponentially from 15s and caps at 5 min', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(15_000);
    expect(backoffMs(2)).toBe(30_000);
    expect(backoffMs(3)).toBe(60_000);
    expect(backoffMs(99)).toBe(SYNC_MAX_BACKOFF_MS);
  });
});

describe('field-outbox · orderForSync', () => {
  it('puts starts before ends, then orders by queue time', () => {
    const out = orderForSync([
      item({ id: 'end:a', kind: 'end', clientRef: 'a', createdAt: 5 }),
      item({ id: 'start:b', kind: 'start', clientRef: 'b', createdAt: 9 }),
      item({ id: 'start:a', kind: 'start', clientRef: 'a', createdAt: 7 }),
    ]);
    expect(out.map((i) => i.id)).toEqual(['start:a', 'start:b', 'end:a']);
  });
});

describe('field-outbox · dueItems', () => {
  it('selects only queued items past their backoff; excludes failed/syncing/synced', () => {
    const items = [
      item({ id: '1', status: 'queued', nextAttemptAt: 100 }),
      item({ id: '2', status: 'queued', nextAttemptAt: 5000 }), // not due yet
      item({ id: '3', status: 'failed' }),
      item({ id: '4', status: 'syncing' }),
      item({ id: '5', status: 'synced' }),
    ];
    expect(dueItems(items, 1000).map((i) => i.id)).toEqual(['1']);
  });
});

describe('field-outbox · reconcile', () => {
  const ok: SyncItemResult = { clientRef: 'a', kind: 'start', ok: true, id: 'v1' };

  it('marks ok/idempotent items synced and clears errors', () => {
    const r = reconcile(item({ lastError: 'x', lastCode: 'error' }), ok, 2000);
    expect(r.status).toBe('synced');
    expect(r.lastError).toBeUndefined();
  });

  it('marks user-fixable codes failed (no auto-retry)', () => {
    for (const code of ['reason_required', 'photo_required', 'invalid'] as const) {
      const r = reconcile(item(), { clientRef: 'a', kind: 'start', ok: false, code }, 2000);
      expect(r.status).toBe('failed');
      expect(r.attempts).toBe(1);
    }
  });

  it('requeues visit_not_found with a short wait (waits for its start)', () => {
    const r = reconcile(item(), { clientRef: 'a', kind: 'end', ok: false, code: 'visit_not_found' }, 2000);
    expect(r.status).toBe('queued');
    expect(r.nextAttemptAt).toBe(2000 + 15_000);
  });

  it('requeues transient errors with exponential backoff', () => {
    const r = reconcile(item({ attempts: 2 }), { clientRef: 'a', kind: 'start', ok: false, code: 'error' }, 2000);
    expect(r.status).toBe('queued');
    expect(r.nextAttemptAt).toBe(2000 + 60_000); // backoff(3)
  });

  it('never mutates the captured action (capturedAt preserved)', () => {
    const before = item();
    const r = reconcile(before, { clientRef: 'a', kind: 'start', ok: false, code: 'error' }, 2000);
    expect(r.action).toBe(before.action);
    expect(r.action.capturedAt).toBe('2026-06-01T08:00:00Z');
  });
});

describe('field-outbox · countByStatus', () => {
  it('tallies the four sync states for the pending indicator', () => {
    const c = countByStatus([
      item({ id: '1', status: 'queued' }), item({ id: '2', status: 'queued' }),
      item({ id: '3', status: 'syncing' }), item({ id: '4', status: 'failed' }), item({ id: '5', status: 'synced' }),
    ]);
    expect(c).toEqual({ queued: 2, syncing: 1, synced: 1, failed: 1 });
  });
});
