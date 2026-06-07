// ============================================================================
// Offline-first sync — engine orchestration (transport + store injected).
//
// The engine is pure orchestration: it depends only on the LocalStore and
// Transport interfaces, so it runs unchanged on web/macOS/Windows and is fully
// unit-testable with in-memory fakes (no DB, no network). See design §5.
// ============================================================================

import type { OutboxEntry, PushOutcome, RemoteRecord, ConflictPolicy } from './types';
import { nextBatch, applyOutcome, dedupeByClientOpId } from './outbox';
import { resolveConflict, type LocalRecord } from './conflict';

/** Local durable store (backed by sync_outbox + the synced tables in prod). */
export interface LocalStore {
  /** Due outbox entries (the store may also flip them to 'inflight'). */
  takeBatch(limit: number, now: number): Promise<OutboxEntry[]>;
  /** Persist an entry's new state. */
  saveEntry(entry: OutboxEntry): Promise<void>;
  /** Current local row (for conflict resolution), or null if absent. */
  getLocal(entity: string, pk: string): Promise<LocalRecord | null>;
  /** Apply a remote record locally (upsert/tombstone) with origin='cloud'. */
  applyRemote(rec: RemoteRecord): Promise<void>;
  getCursor(entity: string): Promise<string | null>;
  setCursor(entity: string, cursor: string): Promise<void>;
}

/** Cloud transport. push is idempotent via clientOpId; pull is cursor-based. */
export interface Transport {
  push(ops: OutboxEntry[]): Promise<PushOutcome[]>;
  pull(entity: string, cursor: string | null): Promise<{ changes: RemoteRecord[]; cursor: string }>;
}

export interface EngineOptions {
  batchSize?: number;
  /** Per-entity conflict policy (defaults to last-write-wins). */
  policyFor?: (entity: string) => ConflictPolicy;
  now?: () => number;
}

export interface PushReport { synced: number; conflicts: number; errors: number; }
export interface PullReport { applied: number; conflicts: number; }

export class SyncEngine {
  private readonly batchSize: number;
  private readonly policyFor: (entity: string) => ConflictPolicy;
  private readonly now: () => number;

  constructor(
    private readonly store: LocalStore,
    private readonly transport: Transport,
    opts: EngineOptions = {},
  ) {
    this.batchSize = opts.batchSize ?? 100;
    this.policyFor = opts.policyFor ?? (() => 'last-write-wins');
    this.now = opts.now ?? (() => Date.now());
  }

  /** Push one batch of local changes to the cloud. */
  async pushOnce(): Promise<PushReport> {
    const now = this.now();
    const batch = dedupeByClientOpId(await this.store.takeBatch(this.batchSize, now));
    if (batch.length === 0) return { synced: 0, conflicts: 0, errors: 0 };

    const outcomes = await this.transport.push(batch);
    const byId = new Map(batch.map((e) => [e.clientOpId, e]));
    const report: PushReport = { synced: 0, conflicts: 0, errors: 0 };

    for (const outcome of outcomes) {
      const entry = byId.get(outcome.clientOpId);
      if (!entry) continue;

      if (outcome.status === 'conflict') {
        report.conflicts++;
        await this.resolvePushConflict(entry, outcome.remote);
        continue;
      }
      const next = applyOutcome(entry, outcome, now);
      if (next.status === 'synced') report.synced++;
      else if (next.status === 'failed') report.errors++;
      await this.store.saveEntry(next);
    }
    return report;
  }

  /** Resolve a server-detected conflict for a pushed op (design §8). */
  private async resolvePushConflict(entry: OutboxEntry, remote: RemoteRecord): Promise<void> {
    // The conflicting local change IS the entry's payload. Use the live local
    // row (if any) only for its timing/version; the data we want to push is the
    // entry payload.
    const live = await this.store.getLocal(entry.entity, entry.pk);
    const local: LocalRecord = {
      pk: entry.pk,
      version: live?.version ?? entry.baseVersion ?? 0,
      updatedAt: live?.updatedAt ?? entry.createdAt,
      origin: 'local',
      deleted: entry.op === 'delete',
      data: entry.payload,
    };
    const res = resolveConflict(this.policyFor(entry.entity), local, remote, remote.data);

    if (res.winner === 'remote') {
      // Server wins → accept remote locally and drop the op.
      await this.store.applyRemote({ ...remote, origin: 'cloud' });
      await this.store.saveEntry({ ...entry, status: 'synced', lastError: `conflict→${res.reason}` });
      return;
    }
    // Local/merged wins → re-enqueue a fresh op rebased on the remote version.
    await this.store.saveEntry({
      ...entry,
      status: 'pending',
      baseVersion: remote.version,
      payload: res.data,
      attempts: 0,
      nextAttemptAt: this.now(),
      lastError: `conflict→${res.reason}`,
    });
  }

  /** Pull cloud changes for an entity and apply them locally. */
  async pullOnce(entity: string): Promise<PullReport> {
    const cursor = await this.store.getCursor(entity);
    const { changes, cursor: nextCursor } = await this.transport.pull(entity, cursor);
    const report: PullReport = { applied: 0, conflicts: 0 };

    for (const remote of changes) {
      const local = await this.store.getLocal(entity, remote.pk);
      // A pending local edit to the same row → resolve before applying remote.
      if (local && local.origin === 'local' && local.version !== remote.version) {
        const res = resolveConflict(this.policyFor(entity), local, remote, remote.data);
        report.conflicts++;
        if (res.winner === 'remote') {
          await this.store.applyRemote({ ...remote, origin: 'cloud' });
          report.applied++;
        }
        // local/merged winner is left for the next push cycle to send up.
        continue;
      }
      await this.store.applyRemote({ ...remote, origin: 'cloud' });
      report.applied++;
    }

    // Advance the cursor only after the batch is durably applied (no skips).
    await this.store.setCursor(entity, nextCursor);
    return report;
  }
}
