import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { WebLocalStore } from './web-store';
import { SyncEngine, type Transport } from '../engine';
import type { OutboxEntry, PushOutcome, RemoteRecord } from '../types';

const dbName = () => `kako-sync-scn-${Math.random().toString(36).slice(2)}`;

/** In-memory stand-in for the cloud + /api/sync, modelling exactly-once. */
class FakeCloud implements Transport {
  rows = new Map<string, RemoteRecord>();
  private seen = new Set<string>();   // applied clientOpIds → dedupe (idempotency)
  failBatches = 0;                    // return error WITHOUT applying
  ackLostBatches = 0;                 // APPLY then report error (lost acknowledgement)
  conflict = new Map<string, RemoteRecord>(); // pk → remote that conflicts (once)

  private apply(o: OutboxEntry) {
    if (this.seen.has(o.clientOpId)) return;     // exactly-once: never apply twice
    this.seen.add(o.clientOpId);
    const k = `${o.entity}|${o.pk}`;
    const prev = this.rows.get(k);
    this.rows.set(k, {
      entity: o.entity, pk: o.pk, version: (prev?.version ?? 0) + 1,
      updatedAt: 1, origin: 'cloud', deleted: o.op === 'delete', data: o.payload,
    });
  }

  async push(ops: OutboxEntry[]): Promise<PushOutcome[]> {
    if (this.failBatches > 0) {
      this.failBatches--;
      return ops.map((o) => ({ clientOpId: o.clientOpId, status: 'error' as const, error: 'network' }));
    }
    if (this.ackLostBatches > 0) {
      this.ackLostBatches--;
      ops.forEach((o) => this.apply(o)); // applied on the server…
      return ops.map((o) => ({ clientOpId: o.clientOpId, status: 'error' as const, error: 'ack lost' })); // …but client never hears
    }
    return ops.map((o) => {
      const c = this.conflict.get(o.pk);
      if (c) { this.conflict.delete(o.pk); return { clientOpId: o.clientOpId, status: 'conflict' as const, remote: c }; }
      this.apply(o);
      return { clientOpId: o.clientOpId, status: 'ok' as const, version: this.rows.get(`${o.entity}|${o.pk}`)!.version };
    });
  }

  async pull(entity: string, _cursor: string | null) {
    const changes = [...this.rows.values()].filter((r) => r.entity === entity);
    return { changes, cursor: String(changes.length) };
  }
}

describe('online offline-safe — full validation scenario', () => {
  it('offline create → refresh → reconnect → sync with NO duplicates', async () => {
    const name = dbName();
    const cloud = new FakeCloud();
    let now = 1000;

    // 1. Online. 2. User creates data.
    let store = await WebLocalStore.open(name);
    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: { total: 10 }, now });

    // 3. Internet disconnects. 4. User creates MORE data (stays local).
    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o2', payload: { total: 20 }, now: now + 1 });

    // 5. User refreshes the browser. 6. Data is still pending locally.
    store.close();
    store = await WebLocalStore.open(name);
    const pendingAfterRefresh = (await store.listOutbox()).filter((e) => e.status === 'pending');
    expect(pendingAfterRefresh).toHaveLength(2);

    // 7. Internet reconnects. 8. Data syncs to cloud. (clock past both enqueues)
    now = 5000;
    const engine = new SyncEngine(store, cloud, { now: () => now });
    const r = await engine.pushOnce();
    expect(r.synced).toBe(2);
    expect(cloud.rows.size).toBe(2);

    // 9. No duplicates: re-running sync creates nothing new.
    const r2 = await engine.pushOnce();
    expect(r2).toEqual({ synced: 0, conflicts: 0, errors: 0 });
    expect(cloud.rows.size).toBe(2);
    expect((await store.counts()).synced).toBe(2);
    store.close();
  });

  it('retry without duplicates even when the server ACK is lost', async () => {
    const cloud = new FakeCloud();
    const store = await WebLocalStore.open(dbName());
    let now = 1000;
    const engine = new SyncEngine(store, cloud, { now: () => now });

    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: { total: 1 }, now });

    // First attempt: the server APPLIES the row but the client never gets the ack.
    cloud.ackLostBatches = 1;
    const a = await engine.pushOnce();
    expect(a.errors).toBe(1);
    expect(cloud.rows.size).toBe(1);            // already on the server

    // Backoff elapses; client retries the SAME clientOpId.
    now += 60_000;
    const b = await engine.pushOnce();
    expect(b.synced).toBe(1);
    expect(cloud.rows.size).toBe(1);            // STILL one row — exactly-once, no duplicate
    store.close();
  });

  it('failed sync recovers automatically after backoff', async () => {
    const cloud = new FakeCloud();
    const store = await WebLocalStore.open(dbName());
    let now = 1000;
    const engine = new SyncEngine(store, cloud, { now: () => now });
    await store.enqueue({ entity: 'visits', op: 'insert', pk: 'v1', payload: {}, now });

    cloud.failBatches = 1;
    expect((await engine.pushOnce()).errors).toBe(1);
    expect((await store.counts()).failed).toBe(1);

    // Not yet due (backoff) → nothing happens.
    expect(await engine.pushOnce()).toEqual({ synced: 0, conflicts: 0, errors: 0 });

    now += 120_000;                              // past backoff
    expect((await engine.pushOnce()).synced).toBe(1);
    expect((await store.counts()).failed).toBe(0);
    expect(cloud.rows.size).toBe(1);
    store.close();
  });

  it('offline update + push-time conflict resolves (server-wins) without losing data', async () => {
    const cloud = new FakeCloud();
    const store = await WebLocalStore.open(dbName());
    const now = 1000;
    const engine = new SyncEngine(store, cloud, { now: () => now, policyFor: () => 'server-wins' });

    // Local edit based on v1; the cloud already moved to v2.
    await store.applyRemote({ entity: 'products', pk: 'p1', version: 1, updatedAt: 1, origin: 'local', deleted: false, data: { price: 5 } });
    await store.enqueue({ entity: 'products', op: 'update', pk: 'p1', payload: { price: 7 }, baseVersion: 1, now });
    cloud.conflict.set('p1', { entity: 'products', pk: 'p1', version: 2, updatedAt: 9, origin: 'cloud', deleted: false, data: { price: 9 } });

    const r = await engine.pushOnce();
    expect(r.conflicts).toBe(1);
    // Server-wins: local row is updated to the cloud value, op is settled (synced).
    const local = await store.getLocal('products', 'p1');
    expect(local?.data).toEqual({ price: 9 });
    expect((await store.counts()).pending).toBe(0);
    store.close();
  });
});
