// ============================================================================
// Sync orchestrator — connectivity + automatic, retrying background sync.
//
// Drives the platform-agnostic SyncEngine from the browser: watches online/
// offline, reclaims interrupted work, runs push+pull cycles automatically with
// the engine's built-in backoff, and publishes status to the SyncStatusStore
// (design §3). Connectivity + timers are injectable so the loop is unit-testable
// without a real browser. Inert until started behind KAKO_SYNC.
// ============================================================================

import type { SyncEngine } from '../engine';
import type { WebLocalStore } from './web-store';
import type { SyncStatusStore } from './status';

export interface Connectivity {
  isOnline(): boolean;
  /** Subscribe to connectivity changes; returns an unsubscribe fn. */
  onChange(cb: (online: boolean) => void): () => void;
}

/** Default connectivity from the browser (navigator.onLine + online/offline). */
export function browserConnectivity(): Connectivity {
  return {
    isOnline: () => (typeof navigator !== 'undefined' ? navigator.onLine : true),
    onChange: (cb) => {
      const on = () => cb(true);
      const off = () => cb(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    },
  };
}

export interface OrchestratorOptions {
  entities: string[];
  intervalMs?: number;
  connectivity?: Connectivity;
  now?: () => number;
}

export class SyncOrchestrator {
  private readonly entities: string[];
  private readonly intervalMs: number;
  private readonly connectivity: Connectivity;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;
  private running = false;

  constructor(
    private readonly store: WebLocalStore,
    private readonly engine: SyncEngine,
    private readonly status: SyncStatusStore,
    opts: OrchestratorOptions,
  ) {
    this.entities = opts.entities;
    this.intervalMs = opts.intervalMs ?? 15_000;
    this.connectivity = opts.connectivity ?? browserConnectivity();
    this.now = opts.now ?? (() => Date.now());
  }

  async start(): Promise<void> {
    this.status.update({ online: this.connectivity.isOnline() });
    await this.store.reclaimInflight(this.now()); // recover work interrupted by a refresh
    await this.refreshCounts();
    this.unsub = this.connectivity.onChange((online) => {
      this.status.update({ online });
      if (online) void this.syncNow(); // reconnect → drain immediately
    });
    this.timer = setInterval(() => { void this.syncNow(); }, this.intervalMs);
    void this.syncNow();
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.unsub) { this.unsub(); this.unsub = null; }
  }

  /** One push+pull cycle. Safe to call concurrently (guarded). Idempotent. */
  async syncNow(): Promise<void> {
    if (this.running) return;
    if (!this.connectivity.isOnline()) { this.status.update({ online: false }); return; }
    this.running = true;
    this.status.update({ online: true, syncing: true });
    try {
      await this.engine.pushOnce();
      for (const entity of this.entities) await this.engine.pullOnce(entity);
      const c = await this.store.counts();
      this.status.update({ syncing: false, pending: c.pending, failed: c.failed, lastSyncedAt: this.now() });
    } catch {
      const c = await this.store.counts().catch(() => ({ pending: 0, failed: 0, conflict: 0, synced: 0 }));
      this.status.update({ syncing: false, pending: c.pending, failed: c.failed });
    } finally {
      this.running = false;
    }
  }

  private async refreshCounts(): Promise<void> {
    const c = await this.store.counts();
    this.status.update({ pending: c.pending, failed: c.failed });
  }
}
