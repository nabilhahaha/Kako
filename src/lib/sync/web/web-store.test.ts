import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { WebLocalStore } from './web-store';

const dbName = () => `kako-sync-test-${Math.random().toString(36).slice(2)}`;

describe('WebLocalStore (durable IndexedDB outbox)', () => {
  it('enqueues a pending op with a stable clientOpId', async () => {
    const store = await WebLocalStore.open(dbName());
    const e = await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: { total: 5 }, now: 1000 });
    expect(e.id).toBeGreaterThan(0);
    expect(e.status).toBe('pending');
    expect(e.clientOpId).toMatch(/[0-9a-f-]{36}/);
    const all = await store.listOutbox();
    expect(all).toHaveLength(1);
    expect(all[0].clientOpId).toBe(e.clientOpId);
    store.close();
  });

  it('survives a refresh: data persists across store re-open (same DB)', async () => {
    const name = dbName();
    const s1 = await WebLocalStore.open(name);
    await s1.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: { a: 1 }, now: 1 });
    await s1.enqueue({ entity: 'visits', op: 'insert', pk: 'v1', payload: { b: 2 }, now: 2 });
    s1.close();

    // Simulate browser refresh: brand-new store instance, same persisted DB.
    const s2 = await WebLocalStore.open(name);
    const all = await s2.listOutbox();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.pk).sort()).toEqual(['o1', 'v1']);
    s2.close();
  });

  it('takeBatch returns due entries (FIFO) and flips them to inflight', async () => {
    const store = await WebLocalStore.open(dbName());
    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: {}, now: 10 });
    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o2', payload: {}, now: 20 });
    const batch = await store.takeBatch(10, 100);
    expect(batch.map((e) => e.pk)).toEqual(['o1', 'o2']);
    expect(batch.every((e) => e.status === 'inflight')).toBe(true);
    // Inflight entries are not taken again.
    expect(await store.takeBatch(10, 100)).toHaveLength(0);
    store.close();
  });

  it('reclaimInflight recovers work interrupted mid-push', async () => {
    const store = await WebLocalStore.open(dbName());
    await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: {}, now: 1 });
    await store.takeBatch(10, 100);                 // → inflight (simulate crash here)
    expect((await store.counts()).pending).toBe(1); // inflight counts as pending-to-sync
    const reclaimed = await store.reclaimInflight(200);
    expect(reclaimed).toBe(1);
    const due = await store.takeBatch(10, 300);
    expect(due).toHaveLength(1);                     // taken again after reclaim
    store.close();
  });

  it('the clientOpId index is unique (defends against duplicate journal rows)', async () => {
    const store = await WebLocalStore.open(dbName());
    const e = await store.enqueue({ entity: 'orders', op: 'insert', pk: 'o1', payload: {}, now: 1 });
    // Forcing a second row with the same clientOpId must be rejected by the index.
    await expect(store.saveEntry({ ...e, id: 0 })).rejects.toBeTruthy();
    store.close();
  });
});
