// ============================================================================
// Sync status — derivation + a tiny observable store (design §3).
//
// Five user-facing states: Online · Offline · Syncing · Synced · Sync failed.
// `deriveStatus` is pure; SyncStatusStore is a useSyncExternalStore-compatible
// observable the status badge subscribes to.
// ============================================================================

export type SyncStatus = 'online' | 'offline' | 'syncing' | 'synced' | 'sync-failed';

export interface SyncStatusInput {
  online: boolean;
  syncing: boolean;
  /** Outbox entries waiting to sync (pending + inflight). */
  pending: number;
  /** Dead-lettered / errored entries surfaced to the user. */
  failed: number;
}

/** Pure mapping from raw signals → the badge state. */
export function deriveStatus(i: SyncStatusInput): SyncStatus {
  if (!i.online) return 'offline';
  if (i.syncing) return 'syncing';
  if (i.failed > 0) return 'sync-failed';
  if (i.pending > 0) return 'online'; // connected, queued work awaiting the next cycle
  return 'synced';
}

export interface SyncStatusSnapshot extends SyncStatusInput {
  status: SyncStatus;
  /** Epoch ms of the last successful full sync, or null. */
  lastSyncedAt: number | null;
}

export class SyncStatusStore {
  private snap: SyncStatusSnapshot = {
    online: true, syncing: false, pending: 0, failed: 0, status: 'synced', lastSyncedAt: null,
  };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): SyncStatusSnapshot => this.snap;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  update(patch: Partial<SyncStatusInput> & { lastSyncedAt?: number }): void {
    const merged = { ...this.snap, ...patch };
    const status = deriveStatus(merged);
    const next: SyncStatusSnapshot = { ...merged, status };
    // Only emit when something observable actually changed.
    if (
      next.status === this.snap.status &&
      next.online === this.snap.online &&
      next.syncing === this.snap.syncing &&
      next.pending === this.snap.pending &&
      next.failed === this.snap.failed &&
      next.lastSyncedAt === this.snap.lastSyncedAt
    ) return;
    this.snap = next;
    for (const cb of this.listeners) cb();
  }
}
