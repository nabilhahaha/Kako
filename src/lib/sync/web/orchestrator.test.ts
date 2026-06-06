import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { WebLocalStore } from './web-store';
import { SyncOrchestrator, type Connectivity } from './orchestrator';
import { SyncStatusStore } from './status';
import { SyncEngine, type Transport } from '../engine';
import type { OutboxEntry, PushOutcome, RemoteRecord } from '../types';

const dbName = () => `kako-orch-${Math.random().toString(36).slice(2)}`;

class FakeCloud implements Transport {
  rows = new Map<string, RemoteRecord>();
  private seen = new Set<string>();
  async push(ops: OutboxEntry[]): Promise<PushOutcome[]> {
    return ops.map((o) => {
      if (!this.seen.has(o.clientOpId)) {
        this.seen.add(o.clientOpId);
        const k = `${o.entity}|${o.pk}`;
        this.rows.set(k, { entity: o.entity, pk: o.pk, version: (this.rows.get(k)?.version ?? 0) + 1, updatedAt: 1, origin: 'cloud', deleted: false, data: o.payload });
      }
      return { clientOpId: o.clientOpId, status: 'ok', version: 1 };
    });
  }
  async pull() { return { changes: [], cursor: '0' }; }
}

class FakeConn implements Connectivity {
  online = true;
  isOnline() { return this.online; }
  onChange() { return () => {}; }
}

describe('SyncOrchestrator — connectivity-driven auto-sync + status', () => {
  it('holds offline, drains on reconnect, and reports status with no duplicates', async () => {
    const store = await WebLocalStore.open(dbName());
    const cloud = new FakeCloud();
    const status = new SyncStatusStore();
    const conn = new FakeConn();
    let now = 1000;
    const engine = new SyncEngine(store, cloud, { now: () => now });
    const orch = new SyncOrchestrator(store, engine, status, { entities: ['orders'], connectivity: conn, now: () => now });

    // Offline: queue work; a sync attempt is a no-op and status shows offline.
    conn.online = false;
    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: { t: 1 }, now });
    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o2', payload: { t: 2 }, now });
    await orch.syncNow();
    expect(status.getSnapshot().status).toBe('offline');
    expect(cloud.rows.size).toBe(0);

    // Reconnect: draining sync mirrors both ops; status becomes synced.
    conn.online = true;
    now = 5000;
    await orch.syncNow();
    expect(cloud.rows.size).toBe(2);
    expect(status.getSnapshot().status).toBe('synced');
    expect(status.getSnapshot().pending).toBe(0);

    // Re-sync creates nothing new (idempotent / no duplicates).
    await orch.syncNow();
    expect(cloud.rows.size).toBe(2);
    store.close();
  });

  it('reclaims inflight work interrupted by a refresh on start (offline-safe)', async () => {
    const name = dbName();
    const s1 = await WebLocalStore.open(name);
    await s1.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: {}, now: 1 });
    await s1.takeBatch(10, 100); // simulate crash mid-push → entry stuck 'inflight'
    s1.close();

    const store = await WebLocalStore.open(name);
    const status = new SyncStatusStore();
    const conn = new FakeConn(); conn.online = false; // stay offline so start() only reclaims
    const engine = new SyncEngine(store, new FakeCloud(), {});
    const orch = new SyncOrchestrator(store, engine, status, { entities: ['orders'], connectivity: conn, intervalMs: 1e9 });
    await orch.start();
    orch.stop();
    // The interrupted op is recovered to pending (not lost).
    const due = await store.takeBatch(10, Date.now());
    expect(due).toHaveLength(1);
    store.close();
  });
});
