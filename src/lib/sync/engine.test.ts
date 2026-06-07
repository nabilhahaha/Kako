import { describe, it, expect } from 'vitest';
import { SyncEngine, type LocalStore, type Transport } from './engine';
import { nextBatch } from './outbox';
import type { OutboxEntry, PushOutcome, RemoteRecord } from './types';
import type { LocalRecord } from './conflict';

function mkEntry(over: Partial<OutboxEntry> = {}): OutboxEntry {
  return { id: 1, entity: 'customers', op: 'update', pk: 'r1', clientOpId: 'op-1', baseVersion: 1,
    payload: { name: 'local' }, status: 'pending', attempts: 0, nextAttemptAt: 0, createdAt: 0, ...over };
}

class MemStore implements LocalStore {
  entries = new Map<number, OutboxEntry>();
  locals = new Map<string, LocalRecord>();
  applied: RemoteRecord[] = [];
  cursors = new Map<string, string>();
  constructor(seed: OutboxEntry[] = []) { seed.forEach((e) => this.entries.set(e.id, e)); }
  async takeBatch(limit: number, now: number) { return nextBatch([...this.entries.values()], now, limit); }
  async saveEntry(e: OutboxEntry) { this.entries.set(e.id, e); }
  async getLocal(entity: string, pk: string) { return this.locals.get(`${entity}:${pk}`) ?? null; }
  async applyRemote(rec: RemoteRecord) {
    this.applied.push(rec);
    this.locals.set(`${rec.entity}:${rec.pk}`, { pk: rec.pk, version: rec.version, updatedAt: rec.updatedAt, origin: rec.origin, deleted: rec.deleted, data: rec.data });
  }
  async getCursor(entity: string) { return this.cursors.get(entity) ?? null; }
  async setCursor(entity: string, c: string) { this.cursors.set(entity, c); }
}

describe('sync/engine — push', () => {
  it('marks ok outcomes synced', async () => {
    const store = new MemStore([mkEntry()]);
    const transport: Transport = {
      push: async (ops) => ops.map((o) => ({ clientOpId: o.clientOpId, status: 'ok' }) as PushOutcome),
      pull: async () => ({ changes: [], cursor: 'c' }),
    };
    const report = await new SyncEngine(store, transport, { now: () => 100 }).pushOnce();
    expect(report).toEqual({ synced: 1, conflicts: 0, errors: 0 });
    expect(store.entries.get(1)!.status).toBe('synced');
  });

  it('does not resend an already-synced entry (no duplicate submission)', async () => {
    const store = new MemStore([mkEntry({ status: 'synced' })]);
    let pushes = 0;
    const transport: Transport = {
      push: async (ops) => { pushes += ops.length; return ops.map((o) => ({ clientOpId: o.clientOpId, status: 'ok' }) as PushOutcome); },
      pull: async () => ({ changes: [], cursor: 'c' }),
    };
    await new SyncEngine(store, transport).pushOnce();
    expect(pushes).toBe(0);
  });

  it('marks errors failed with backoff', async () => {
    const store = new MemStore([mkEntry()]);
    const transport: Transport = {
      push: async (ops) => ops.map((o) => ({ clientOpId: o.clientOpId, status: 'error', error: 'net' }) as PushOutcome),
      pull: async () => ({ changes: [], cursor: 'c' }),
    };
    const report = await new SyncEngine(store, transport, { now: () => 100 }).pushOnce();
    expect(report.errors).toBe(1);
    const e = store.entries.get(1)!;
    expect(e.status).toBe('failed');
    expect(e.attempts).toBe(1);
    expect(e.nextAttemptAt).toBeGreaterThan(100);
  });

  it('server-wins conflict → applies remote and drops the op', async () => {
    const store = new MemStore([mkEntry({ baseVersion: 1 })]);
    const remote: RemoteRecord = { entity: 'customers', pk: 'r1', version: 5, updatedAt: 9999, origin: 'cloud', deleted: false, data: { name: 'server' } };
    const transport: Transport = {
      push: async (ops) => ops.map((o) => ({ clientOpId: o.clientOpId, status: 'conflict', remote }) as PushOutcome),
      pull: async () => ({ changes: [], cursor: 'c' }),
    };
    const report = await new SyncEngine(store, transport, { policyFor: () => 'server-wins' }).pushOnce();
    expect(report.conflicts).toBe(1);
    expect(store.entries.get(1)!.status).toBe('synced');
    expect(store.applied.at(-1)!.data).toEqual({ name: 'server' });
  });

  it('client-wins conflict → re-enqueues rebased on the remote version', async () => {
    const store = new MemStore([mkEntry({ baseVersion: 1, payload: { name: 'mine' } })]);
    const remote: RemoteRecord = { entity: 'customers', pk: 'r1', version: 7, updatedAt: 1, origin: 'cloud', deleted: false, data: { name: 'server' } };
    const transport: Transport = {
      push: async (ops) => ops.map((o) => ({ clientOpId: o.clientOpId, status: 'conflict', remote }) as PushOutcome),
      pull: async () => ({ changes: [], cursor: 'c' }),
    };
    await new SyncEngine(store, transport, { policyFor: () => 'client-wins' }).pushOnce();
    const e = store.entries.get(1)!;
    expect(e.status).toBe('pending');
    expect(e.baseVersion).toBe(7); // rebased
    expect(e.attempts).toBe(0);
    expect(e.payload).toEqual({ name: 'mine' });
  });
});

describe('sync/engine — pull', () => {
  it('applies remote changes and advances the cursor only after applying', async () => {
    const store = new MemStore();
    const changes: RemoteRecord[] = [
      { entity: 'customers', pk: 'a', version: 1, updatedAt: 10, origin: 'cloud', deleted: false, data: { n: 1 } },
      { entity: 'customers', pk: 'b', version: 1, updatedAt: 11, origin: 'cloud', deleted: false, data: { n: 2 } },
    ];
    const transport: Transport = {
      push: async () => [],
      pull: async (_e, cursor) => { expect(cursor).toBeNull(); return { changes, cursor: 'cur-2' }; },
    };
    const report = await new SyncEngine(store, transport).pullOnce('customers');
    expect(report.applied).toBe(2);
    expect(store.applied).toHaveLength(2);
    expect(await store.getCursor('customers')).toBe('cur-2');
  });

  it('detects a conflict against a pending local edit (server-wins applies remote)', async () => {
    const store = new MemStore();
    store.locals.set('customers:a', { pk: 'a', version: 1, updatedAt: 10, origin: 'local', deleted: false, data: { n: 'local' } });
    const remote: RemoteRecord = { entity: 'customers', pk: 'a', version: 2, updatedAt: 50, origin: 'cloud', deleted: false, data: { n: 'cloud' } };
    const transport: Transport = {
      push: async () => [],
      pull: async () => ({ changes: [remote], cursor: 'c' }),
    };
    const report = await new SyncEngine(store, transport, { policyFor: () => 'server-wins' }).pullOnce('customers');
    expect(report.conflicts).toBe(1);
    expect(report.applied).toBe(1);
    expect(store.locals.get('customers:a')!.data).toEqual({ n: 'cloud' });
  });
});
