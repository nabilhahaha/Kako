import type { VisitAction, SyncItemResult, SyncErrorCode } from './field-sync';

/** ── Field Execution offline outbox (FE-2c) ─────────────────────────────────
 *  A persistent (IndexedDB) queue of visit actions captured in the field, drained
 *  to the idempotent syncOutbox endpoint when connectivity allows. Survives app
 *  restarts/refresh. Photos captured offline are stored as blobs and uploaded on
 *  drain. `action.capturedAt` (set when the rep acted) is never overwritten — the
 *  item's `createdAt` is the separate queue/sync clock.
 *
 *  This file is browser-oriented: all IndexedDB access is guarded so the module
 *  is import-safe under SSR/tests. The pure helpers (backoff/order/reconcile) are
 *  exported for unit testing without IndexedDB. */

export type OutboxStatus = 'queued' | 'syncing' | 'synced' | 'failed';

export interface OutboxItem {
  id: string;                 // `${kind}:${clientRef}` — natural idempotency key
  kind: 'start' | 'end';
  clientRef: string;
  action: VisitAction;        // carries capturedAt + GPS, sent verbatim
  photoKey?: string;          // blob store key for an offline-captured photo, until uploaded
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  lastCode?: SyncErrorCode;
  nextAttemptAt: number;      // epoch ms — earliest a queued item may retry
  createdAt: number;          // queue clock (≠ action.capturedAt)
}

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

export const SYNC_MAX_BACKOFF_MS = 5 * 60_000;

/** Exponential backoff: 15s, 30s, 60s, … capped at 5 min. */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(SYNC_MAX_BACKOFF_MS, 15_000 * 2 ** (attempts - 1));
}

/** Starts before ends (so a batch applies a whole visit in order), then by queue
 *  time — covers the "end queued before start" race within a single drain. */
export function orderForSync(items: OutboxItem[]): OutboxItem[] {
  const rank = (k: OutboxItem['kind']) => (k === 'start' ? 0 : 1);
  return [...items].sort((a, b) => rank(a.kind) - rank(b.kind) || a.createdAt - b.createdAt);
}

/** Items eligible to send now: queued and past their backoff window. `failed`
 *  items need user action (reason/photo) and are excluded from auto-retry. */
export function dueItems(items: OutboxItem[], now: number): OutboxItem[] {
  return items.filter((it) => it.status === 'queued' && it.nextAttemptAt <= now);
}

/** Fold a server result back into an item. ok/idempotent ⇒ synced; user-fixable
 *  codes ⇒ failed (no auto-retry); visit_not_found ⇒ requeue (its start hasn't
 *  synced yet); transient ⇒ requeue with backoff. */
export function reconcile(item: OutboxItem, result: SyncItemResult, now: number): OutboxItem {
  if (result.ok) return { ...item, status: 'synced', lastError: undefined, lastCode: undefined };
  const attempts = item.attempts + 1;
  const base = { ...item, attempts, lastError: result.error, lastCode: result.code };
  if (result.code === 'reason_required' || result.code === 'photo_required' || result.code === 'invalid') {
    return { ...base, status: 'failed' };           // needs the rep to fix before retry
  }
  // visit_not_found ⇒ short wait for its start; everything else ⇒ standard backoff
  const wait = result.code === 'visit_not_found' ? Math.min(backoffMs(1), 30_000) : backoffMs(attempts);
  return { ...base, status: 'queued', nextAttemptAt: now + wait };
}

export function countByStatus(items: OutboxItem[]): Record<OutboxStatus, number> {
  const c: Record<OutboxStatus, number> = { queued: 0, syncing: 0, synced: 0, failed: 0 };
  for (const it of items) c[it.status]++;
  return c;
}

// ── IndexedDB shell (browser only) ─────────────────────────────────────────

const DB_NAME = 'kako-field';
const DB_VERSION = 1;
const ITEMS = 'outbox';
const BLOBS = 'photos';

function hasIDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export interface DrainDeps {
  sync: (items: VisitAction[]) => Promise<{ ok: boolean; results: SyncItemResult[]; error?: string }>;
  uploadPhoto?: (blob: Blob, clientRef: string) => Promise<string>;
  now?: () => number;
}

/** The persistent outbox. One instance per app; all methods are no-ops (return
 *  empty) when IndexedDB is unavailable so SSR/tests don't crash. */
export class FieldOutbox {
  private dbp: Promise<IDBDatabase> | null = null;
  private db(): Promise<IDBDatabase> {
    if (!this.dbp) this.dbp = openDb();
    return this.dbp;
  }

  /** Queue a visit action (optionally with an offline photo blob). Idempotent on
   *  id, so re-queuing the same action just refreshes it. */
  async enqueue(action: VisitAction, photoBlob?: Blob): Promise<void> {
    if (!hasIDB()) return;
    const db = await this.db();
    const id = `${action.kind}:${action.clientRef}`;
    let photoKey: string | undefined;
    if (photoBlob) {
      photoKey = `${id}:photo`;
      await tx(db, BLOBS, 'readwrite', (s) => s.put({ key: photoKey, blob: photoBlob, clientRef: action.clientRef }));
    }
    const existing = await tx<OutboxItem | undefined>(db, ITEMS, 'readonly', (s) => s.get(id) as IDBRequest<OutboxItem | undefined>);
    const item: OutboxItem = {
      id, kind: action.kind, clientRef: action.clientRef, action,
      photoKey: photoKey ?? existing?.photoKey,
      status: 'queued', attempts: existing?.attempts ?? 0,
      nextAttemptAt: 0, createdAt: existing?.createdAt ?? Date.now(),
    };
    await tx(db, ITEMS, 'readwrite', (s) => s.put(item));
  }

  async list(): Promise<OutboxItem[]> {
    if (!hasIDB()) return [];
    const db = await this.db();
    return tx<OutboxItem[]>(db, ITEMS, 'readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>);
  }

  async counts(): Promise<Record<OutboxStatus, number>> {
    return countByStatus(await this.list());
  }

  /** Remove items that have synced (housekeeping). */
  async clearSynced(): Promise<void> {
    if (!hasIDB()) return;
    const db = await this.db();
    const all = await this.list();
    for (const it of all) {
      if (it.status === 'synced') {
        await tx(db, ITEMS, 'readwrite', (s) => s.delete(it.id));
        if (it.photoKey) await tx(db, BLOBS, 'readwrite', (s) => s.delete(it.photoKey!));
      }
    }
  }

  private async put(item: OutboxItem): Promise<void> {
    const db = await this.db();
    await tx(db, ITEMS, 'readwrite', (s) => s.put(item));
  }
  private async getBlob(key: string): Promise<Blob | undefined> {
    const db = await this.db();
    const row = await tx<{ blob: Blob } | undefined>(db, BLOBS, 'readonly', (s) => s.get(key) as IDBRequest<{ blob: Blob } | undefined>);
    return row?.blob;
  }

  /** Drain due items: upload pending photos, send the batch, reconcile results.
   *  Never throws; a network failure requeues the in-flight items with backoff.
   *  Returns a small summary for the caller/UI. */
  async drain(deps: DrainDeps): Promise<{ sent: number; synced: number; failed: number }> {
    if (!hasIDB()) return { sent: 0, synced: 0, failed: 0 };
    const now = deps.now ?? (() => Date.now());
    const due = orderForSync(dueItems(await this.list(), now()));
    if (due.length === 0) return { sent: 0, synced: 0, failed: 0 };

    // Resolve offline photos to remote paths first; keep unresolved items queued.
    const ready: OutboxItem[] = [];
    for (const it of due) {
      if (it.photoKey && deps.uploadPhoto) {
        try {
          const blob = await this.getBlob(it.photoKey);
          if (blob) {
            const path = await deps.uploadPhoto(blob, it.clientRef);
            it.action = { ...it.action, photo: path } as VisitAction;
            it.photoKey = undefined;
            await this.put(it);
          }
        } catch (e) {
          await this.put({ ...it, attempts: it.attempts + 1, status: 'queued', lastError: (e as Error).message, lastCode: 'error', nextAttemptAt: now() + backoffMs(it.attempts + 1) });
          continue; // skip this item this round (photo not yet uploaded)
        }
      }
      ready.push(it);
    }
    if (ready.length === 0) return { sent: 0, synced: 0, failed: 0 };

    for (const it of ready) await this.put({ ...it, status: 'syncing' });

    let results: SyncItemResult[];
    try {
      const res = await deps.sync(ready.map((it) => it.action));
      if (!res.ok) throw new Error(res.error ?? 'sync failed');
      results = res.results;
    } catch (e) {
      // Whole call failed (offline/server) — requeue everything with backoff.
      for (const it of ready) await this.put({ ...it, status: 'queued', attempts: it.attempts + 1, lastError: (e as Error).message, lastCode: 'error', nextAttemptAt: now() + backoffMs(it.attempts + 1) });
      return { sent: ready.length, synced: 0, failed: 0 };
    }

    let synced = 0, failed = 0;
    const byKey = new Map(results.map((r) => [`${r.kind}:${r.clientRef}`, r]));
    for (const it of ready) {
      const r = byKey.get(it.id);
      if (!r) { await this.put({ ...it, status: 'queued', nextAttemptAt: now() + backoffMs(it.attempts + 1), attempts: it.attempts + 1 }); continue; }
      const next = reconcile(it, r, now());
      await this.put(next);
      if (next.status === 'synced') synced++;
      else if (next.status === 'failed') failed++;
    }
    return { sent: ready.length, synced, failed };
  }
}

let _outbox: FieldOutbox | null = null;
export function getFieldOutbox(): FieldOutbox {
  if (!_outbox) _outbox = new FieldOutbox();
  return _outbox;
}
