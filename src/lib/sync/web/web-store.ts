// ============================================================================
// Durable browser LocalStore for the online offline-safe edition.
//
// Backs the platform-agnostic SyncEngine (src/lib/sync/engine.ts) with
// IndexedDB, so pending changes survive refresh / browser close / device restart
// (design §2). Implements the engine's LocalStore plus the write-seam (enqueue)
// the app uses to record a mutation locally-first, and read helpers for backups.
// Standalone — wired into the app only behind KAKO_SYNC.
// ============================================================================

import type { OutboxEntry, RemoteRecord, SyncOp } from '../types';
import type { LocalStore } from '../engine';
import type { LocalRecord } from '../conflict';
import { newClientOpId } from './client-op-id';
import {
  openSyncDb, withStore, getAll, idbReq,
  STORE_OUTBOX, STORE_RECORDS, STORE_CURSORS,
} from './idb';

const recKey = (entity: string, pk: string) => `${entity} ${pk}`;

interface StoredRecord extends RemoteRecord { key: string }

export class WebLocalStore implements LocalStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(name?: string): Promise<WebLocalStore> {
    return new WebLocalStore(await openSyncDb(name));
  }

  // --- write-seam: record a mutation locally-first --------------------------

  /** Append a mutation to the durable outbox and return the persisted entry.
   *  The clientOpId is stable for the life of this op (idempotent retries). */
  async enqueue(input: {
    entity: string;
    op: SyncOp;
    pk: string;
    payload: Record<string, unknown>;
    baseVersion?: number | null;
    now?: number;
  }): Promise<OutboxEntry> {
    const now = input.now ?? Date.now();
    const entry: Omit<OutboxEntry, 'id'> = {
      entity: input.entity,
      op: input.op,
      pk: input.pk,
      clientOpId: newClientOpId(),
      baseVersion: input.baseVersion ?? null,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
    };
    const id = await withStore(this.db, STORE_OUTBOX, 'readwrite', (s) =>
      idbReq(s.add(entry as OutboxEntry) as IDBRequest<IDBValidKey>),
    );
    return { ...(entry as OutboxEntry), id: Number(id) };
  }

  // --- LocalStore (consumed by SyncEngine) ----------------------------------

  async takeBatch(limit: number, now: number): Promise<OutboxEntry[]> {
    const all = await getAll<OutboxEntry>(this.db, STORE_OUTBOX);
    const due = all
      .filter((e) => (e.status === 'pending' || e.status === 'failed') && e.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
      .slice(0, Math.max(0, limit));
    // Flip to inflight so a concurrent loop can't take them twice.
    await withStore(this.db, STORE_OUTBOX, 'readwrite', async (s) => {
      for (const e of due) await idbReq(s.put({ ...e, status: 'inflight' }));
    });
    return due.map((e) => ({ ...e, status: 'inflight' as const }));
  }

  async saveEntry(entry: OutboxEntry): Promise<void> {
    await withStore(this.db, STORE_OUTBOX, 'readwrite', (s) => idbReq(s.put(entry)));
  }

  async getLocal(entity: string, pk: string): Promise<LocalRecord | null> {
    const rec = await withStore(this.db, STORE_RECORDS, 'readonly', (s) =>
      idbReq(s.get(recKey(entity, pk)) as IDBRequest<StoredRecord | undefined>),
    );
    if (!rec) return null;
    return { pk: rec.pk, version: rec.version, updatedAt: rec.updatedAt, origin: rec.origin, deleted: rec.deleted, data: rec.data };
  }

  async applyRemote(rec: RemoteRecord): Promise<void> {
    const stored: StoredRecord = { ...rec, key: recKey(rec.entity, rec.pk) };
    await withStore(this.db, STORE_RECORDS, 'readwrite', (s) => idbReq(s.put(stored)));
  }

  async getCursor(entity: string): Promise<string | null> {
    const row = await withStore(this.db, STORE_CURSORS, 'readonly', (s) =>
      idbReq(s.get(entity) as IDBRequest<{ entity: string; cursor: string } | undefined>),
    );
    return row?.cursor ?? null;
  }

  async setCursor(entity: string, cursor: string): Promise<void> {
    await withStore(this.db, STORE_CURSORS, 'readwrite', (s) => idbReq(s.put({ entity, cursor })));
  }

  // --- counters + backup ----------------------------------------------------

  /** Reset entries stuck 'inflight' (e.g. a refresh mid-push) back to pending so
   *  they are retried — never silently lost. Call on orchestrator start. */
  async reclaimInflight(now = Date.now()): Promise<number> {
    const all = await getAll<OutboxEntry>(this.db, STORE_OUTBOX);
    const stuck = all.filter((e) => e.status === 'inflight');
    await withStore(this.db, STORE_OUTBOX, 'readwrite', async (s) => {
      for (const e of stuck) await idbReq(s.put({ ...e, status: 'pending', nextAttemptAt: now }));
    });
    return stuck.length;
  }

  /** Live counts driving the Sync status UI. */
  async counts(): Promise<{ pending: number; failed: number; conflict: number; synced: number }> {
    const all = await getAll<OutboxEntry>(this.db, STORE_OUTBOX);
    const c = { pending: 0, failed: 0, conflict: 0, synced: 0 };
    for (const e of all) {
      if (e.status === 'pending' || e.status === 'inflight') c.pending++;
      else if (e.status === 'failed') c.failed++;
      else if (e.status === 'conflict') c.conflict++;
      else if (e.status === 'synced') c.synced++;
    }
    return c;
  }

  /** Raw outbox (for "export local pending data"). */
  listOutbox(): Promise<OutboxEntry[]> {
    return getAll<OutboxEntry>(this.db, STORE_OUTBOX);
  }

  /** Local mirror of synced rows (for "export synced data"). */
  async listRecords(): Promise<RemoteRecord[]> {
    const rows = await getAll<StoredRecord>(this.db, STORE_RECORDS);
    return rows.map((r) => ({
      entity: r.entity, pk: r.pk, version: r.version, updatedAt: r.updatedAt,
      origin: r.origin, deleted: r.deleted, data: r.data,
    }));
  }

  /** Drop entries already synced (housekeeping); keeps the journal bounded. */
  async pruneSynced(): Promise<number> {
    const all = await getAll<OutboxEntry>(this.db, STORE_OUTBOX);
    const synced = all.filter((e) => e.status === 'synced');
    await withStore(this.db, STORE_OUTBOX, 'readwrite', async (s) => {
      for (const e of synced) await idbReq(s.delete(e.id));
    });
    return synced.length;
  }

  close(): void { this.db.close(); }
}
