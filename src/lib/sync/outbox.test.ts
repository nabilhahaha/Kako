import { describe, it, expect } from 'vitest';
import { backoffMs, isDue, isDeadLettered, nextBatch, dedupeByClientOpId, applyOutcome, MAX_ATTEMPTS } from './outbox';
import type { OutboxEntry } from './types';

const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({
  id: 1, entity: 'e', op: 'insert', pk: 'r1', clientOpId: 'op-1', baseVersion: null,
  payload: {}, status: 'pending', attempts: 0, nextAttemptAt: 0, createdAt: 0, ...over,
});

describe('sync/outbox — backoff', () => {
  it('is exponential and capped', () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(100)).toBe(5 * 60 * 1000); // capped
  });
});

describe('sync/outbox — scheduling', () => {
  it('isDue respects status, time, and attempt cap', () => {
    expect(isDue(entry({ status: 'pending', nextAttemptAt: 0 }), 10)).toBe(true);
    expect(isDue(entry({ status: 'failed', nextAttemptAt: 100 }), 10)).toBe(false); // backoff not elapsed
    expect(isDue(entry({ status: 'inflight' }), 10)).toBe(false);
    expect(isDue(entry({ status: 'synced' }), 10)).toBe(false);
    expect(isDue(entry({ status: 'failed', attempts: MAX_ATTEMPTS }), 10)).toBe(false); // dead-lettered
  });

  it('nextBatch returns due entries FIFO, capped by limit', () => {
    const es = [
      entry({ id: 3, clientOpId: 'c', createdAt: 30 }),
      entry({ id: 1, clientOpId: 'a', createdAt: 10 }),
      entry({ id: 2, clientOpId: 'b', createdAt: 20 }),
      entry({ id: 4, clientOpId: 'd', status: 'synced', createdAt: 5 }),
    ];
    const batch = nextBatch(es, 100, 2);
    expect(batch.map((e) => e.clientOpId)).toEqual(['a', 'b']);
  });

  it('dedupeByClientOpId keeps the first occurrence', () => {
    const es = [entry({ id: 1, clientOpId: 'x' }), entry({ id: 2, clientOpId: 'x' }), entry({ id: 3, clientOpId: 'y' })];
    expect(dedupeByClientOpId(es).map((e) => e.id)).toEqual([1, 3]);
  });
});

describe('sync/outbox — applyOutcome', () => {
  it('ok → synced', () => {
    expect(applyOutcome(entry(), { clientOpId: 'op-1', status: 'ok' }, 100).status).toBe('synced');
  });

  it('error → failed with incremented attempts and backoff', () => {
    const next = applyOutcome(entry({ attempts: 1 }), { clientOpId: 'op-1', status: 'error', error: 'net' }, 100);
    expect(next.status).toBe('failed');
    expect(next.attempts).toBe(2);
    expect(next.lastError).toBe('net');
    expect(next.nextAttemptAt).toBe(100 + backoffMs(2));
  });

  it('reaches dead-letter after MAX_ATTEMPTS', () => {
    let e = entry({ attempts: MAX_ATTEMPTS - 1 });
    e = applyOutcome(e, { clientOpId: 'op-1', status: 'error', error: 'net' }, 0);
    expect(e.attempts).toBe(MAX_ATTEMPTS);
    expect(isDeadLettered(e)).toBe(true);
    expect(isDue(e, Number.MAX_SAFE_INTEGER)).toBe(false); // never retried again
  });

  it('conflict → flagged for the engine, no attempt burned', () => {
    const next = applyOutcome(entry({ attempts: 2 }), { clientOpId: 'op-1', status: 'conflict', remote: { entity: 'e', pk: 'r1', version: 2, updatedAt: 1, origin: 'cloud', deleted: false, data: {} } }, 100);
    expect(next.status).toBe('conflict');
    expect(next.attempts).toBe(2);
  });
});
