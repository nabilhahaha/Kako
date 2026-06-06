import { describe, it, expect } from 'vitest';
import { deriveStatus, SyncStatusStore } from './status';

describe('sync status derivation', () => {
  it('maps raw signals to the five badge states', () => {
    expect(deriveStatus({ online: false, syncing: false, pending: 3, failed: 0 })).toBe('offline');
    expect(deriveStatus({ online: true, syncing: true, pending: 3, failed: 0 })).toBe('syncing');
    expect(deriveStatus({ online: true, syncing: false, pending: 0, failed: 2 })).toBe('sync-failed');
    expect(deriveStatus({ online: true, syncing: false, pending: 2, failed: 0 })).toBe('online');
    expect(deriveStatus({ online: true, syncing: false, pending: 0, failed: 0 })).toBe('synced');
  });

  it('offline takes precedence even with failures/pending', () => {
    expect(deriveStatus({ online: false, syncing: true, pending: 1, failed: 5 })).toBe('offline');
  });
});

describe('SyncStatusStore', () => {
  it('notifies subscribers only on observable change', () => {
    const store = new SyncStatusStore();
    let n = 0;
    const unsub = store.subscribe(() => { n++; });
    store.update({ pending: 1 }); // synced → online
    store.update({ pending: 1 }); // no change
    expect(store.getSnapshot().status).toBe('online');
    expect(n).toBe(1);
    store.update({ online: false }); // → offline
    expect(store.getSnapshot().status).toBe('offline');
    expect(n).toBe(2);
    unsub();
  });
});
