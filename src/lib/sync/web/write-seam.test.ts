import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebLocalStore } from './web-store';
import { recordMutation, setSyncStore, clearSyncStore } from './write-seam';

const dbName = () => `kako-seam-${Math.random().toString(36).slice(2)}`;

describe('local-first write seam', () => {
  const prev = process.env.NEXT_PUBLIC_KAKO_SYNC;
  // jsdom-less: provide a minimal window so the browser-guard passes.
  beforeEach(() => { (globalThis as { window?: unknown }).window = globalThis; });
  afterEach(() => { clearSyncStore(); process.env.NEXT_PUBLIC_KAKO_SYNC = prev; delete (globalThis as { window?: unknown }).window; });

  it('is a no-op when KAKO_SYNC is off (production default) — returns null', async () => {
    process.env.NEXT_PUBLIC_KAKO_SYNC = '0';
    const id = await recordMutation({ entity: 'orders', op: 'insert', pk: 'o1', payload: { t: 1 } });
    expect(id).toBeNull();
  });

  it('journals the mutation to the shared outbox and kicks a sync when enabled', async () => {
    process.env.NEXT_PUBLIC_KAKO_SYNC = '1';
    const store = await WebLocalStore.open(dbName());
    const kick = vi.fn();
    setSyncStore(store, kick);

    const id = await recordMutation({ entity: 'orders', op: 'insert', pk: 'o1', payload: { total: 9 } });
    expect(id).toMatch(/[0-9a-f-]{36}/);
    expect(kick).toHaveBeenCalledOnce();

    const outbox = await store.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ entity: 'orders', op: 'insert', pk: 'o1', status: 'pending', clientOpId: id });
    store.close();
  });
});
