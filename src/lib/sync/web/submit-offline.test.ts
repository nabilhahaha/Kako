import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebLocalStore } from './web-store';
import { setSyncStore, clearSyncStore } from './write-seam';
import { submitOffline, isNetworkError } from './submit-offline';

const dbName = () => `kako-submit-${Math.random().toString(36).slice(2)}`;

describe('submitOffline', () => {
  const prev = process.env.NEXT_PUBLIC_KAKO_SYNC;
  let onLine = true;
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = globalThis;
    onLine = true;
    Object.defineProperty(globalThis, 'navigator', { value: { get onLine() { return onLine; } }, configurable: true });
  });
  afterEach(() => {
    clearSyncStore();
    process.env.NEXT_PUBLIC_KAKO_SYNC = prev;
    delete (globalThis as { window?: unknown }).window;
  });

  it('isNetworkError flags connectivity failures, not app errors', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource'))).toBe(true);
    onLine = false;
    expect(isNetworkError(new Error('anything'))).toBe(true); // navigator offline
    onLine = true;
    expect(isNetworkError(new Error('column does not exist'))).toBe(false);
  });

  it('flag OFF: passthrough — network rejection propagates (production unchanged)', async () => {
    process.env.NEXT_PUBLIC_KAKO_SYNC = '0';
    await expect(submitOffline({
      action: () => Promise.reject(new Error('Failed to fetch')),
      mutation: () => ({ entity: 'orders', op: 'insert', pk: 'x', payload: {} }),
    })).rejects.toThrow(/failed to fetch/i);
  });

  it('flag ON, online success: returns result and journals the mutation', async () => {
    process.env.NEXT_PUBLIC_KAKO_SYNC = '1';
    const store = await WebLocalStore.open(dbName());
    setSyncStore(store);
    const res = await submitOffline<{ id: string }>({
      action: async () => ({ ok: true, data: { id: 'srv-1' } }),
      mutation: (data) => ({ entity: 'orders', op: 'insert', pk: data?.id ?? 'local', payload: { v: 1 } }),
    });
    expect(res).toMatchObject({ ok: true, data: { id: 'srv-1' } });
    expect(res.offline).toBeUndefined();
    const outbox = await store.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: 'orders', pk: 'srv-1' });
    store.close();
  });

  it('flag ON, offline: journals with the client pk and returns offline-success (no throw)', async () => {
    process.env.NEXT_PUBLIC_KAKO_SYNC = '1';
    onLine = false;
    const store = await WebLocalStore.open(dbName());
    setSyncStore(store);
    const res = await submitOffline({
      action: () => Promise.reject(new Error('Failed to fetch')),
      mutation: (data) => ({ entity: 'orders', op: 'insert', pk: data ? 'srv' : 'client-uuid', payload: { v: 2 } }),
    });
    expect(res).toEqual({ ok: true, offline: true });
    const outbox = await store.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: 'orders', pk: 'client-uuid', status: 'pending' });
    store.close();
  });

  it('flag ON: a genuine (non-network) error still surfaces', async () => {
    process.env.NEXT_PUBLIC_KAKO_SYNC = '1';
    await expect(submitOffline({
      action: () => Promise.reject(new Error('boom: null pointer')),
      mutation: () => null,
    })).rejects.toThrow(/boom/);
  });
});
