'use client';

// ============================================================================
// Offline Sync — browser client queue (Phase 7B / mobile). IndexedDB-backed
// mutation queue + sync to /api/internal/offline-sync. Reuses the pure dedupe/
// batch engine. Browser-only (guarded). Field workflows enqueue() while offline;
// syncNow() drains the queue when connectivity returns.
// ============================================================================

import { dedupeMutations, batchMutations } from './queue';
import type { OfflineMutation, SyncOperation, SyncStatus } from './types';

const DB_NAME = 'vantora-offline';
const STORE = 'mutations';
const DEVICE_KEY = 'vantora-device-id';
const SEQ_KEY = 'vantora-client-seq';

type StoredMutation = OfflineMutation & {
  localStatus: 'pending' | 'synced' | 'conflict' | 'rejected' | 'failed';
  attempts?: number;          // transient-failure retry count
  nextAttemptAt?: string | null; // ISO — earliest time to retry (backoff)
};

// Retry policy: bounded exponential backoff, then dead-letter (localStatus
// 'failed') so a poison mutation can't loop forever — it's surfaced for review.
export const MAX_SYNC_ATTEMPTS = 6;
const BACKOFF_BASE_MS = 2000;
const BACKOFF_CAP_MS = 5 * 60 * 1000;

/** Backoff before retry N (1-based): 2s,4s,8s,…capped at 5m. Pure (testable). */
export function nextBackoffMs(attempt: number): number {
  const a = Math.max(1, attempt);
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (a - 1));
}

function hasIDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/** Stable per-device id (persisted). */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

function nextSeq(): number {
  if (typeof window === 'undefined') return 0;
  const n = Number(window.localStorage.getItem(SEQ_KEY) ?? '0') + 1;
  window.localStorage.setItem(SEQ_KEY, String(n));
  return n;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'idempotencyKey' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

/** Enqueue a field mutation while offline (or online — it syncs immediately after). */
export async function enqueue(entity: string, operation: SyncOperation, payload: Record<string, unknown>, opts: { entityId?: string; baseVersion?: string | null } = {}): Promise<string> {
  if (!hasIDB()) return '';
  const m: StoredMutation = {
    idempotencyKey: crypto.randomUUID(),
    deviceId: getDeviceId(),
    userId: '',
    entity, entityId: opts.entityId ?? null, operation, payload,
    clientSeq: nextSeq(), clientTs: new Date().toISOString(), baseVersion: opts.baseVersion ?? null,
    localStatus: 'pending', attempts: 0, nextAttemptAt: null,
  };
  await tx('readwrite', (s) => s.put(m));
  return m.idempotencyKey;
}

function getAll(): Promise<StoredMutation[]> {
  return tx<StoredMutation[]>('readonly', (s) => s.getAll());
}

/** Pending mutations that are DUE (past their backoff window), ordered + deduped. */
export async function listPending(): Promise<OfflineMutation[]> {
  if (!hasIDB()) return [];
  const all = await getAll();
  const now = Date.now();
  const due = all.filter((m) => m.localStatus === 'pending' && (!m.nextAttemptAt || Date.parse(m.nextAttemptAt) <= now));
  return dedupeMutations(due);
}

/** Count of pending (due) mutations. */
export async function pendingCount(): Promise<number> {
  return (await listPending()).length;
}

/** Count of dead-lettered mutations (exhausted retries) — surfaced for review. */
export async function failedCount(): Promise<number> {
  if (!hasIDB()) return 0;
  return (await getAll()).filter((m) => m.localStatus === 'failed').length;
}

/** Bump retry state for a batch left unresolved by a transient failure (network
 *  or 5xx): increment attempts + set the next backoff window, or dead-letter. */
async function bumpAttempts(batch: OfflineMutation[]): Promise<void> {
  for (const m of batch) {
    const cur = await tx<StoredMutation | undefined>('readonly', (s) => s.get(m.idempotencyKey));
    if (!cur || cur.localStatus !== 'pending') continue;
    const attempts = (cur.attempts ?? 0) + 1;
    cur.attempts = attempts;
    if (attempts >= MAX_SYNC_ATTEMPTS) { cur.localStatus = 'failed'; cur.nextAttemptAt = null; }
    else cur.nextAttemptAt = new Date(Date.now() + nextBackoffMs(attempts)).toISOString();
    await tx('readwrite', (s) => s.put(cur));
  }
}

/** Per-mutation server outcome, surfaced so screens can reconcile their UI
 *  (e.g. the journey list moves a stop from "Pending Validation" to its verdict). */
export interface SyncResultItem {
  idempotencyKey: string;
  entity: string;
  entityId: string | null;
  status: SyncStatus;
  verdict?: string | null;
}

export interface SyncOutcome { synced: number; conflicts: number; rejected: number; offline?: boolean; results: SyncResultItem[] }

/**
 * Drain the queue: POST batches to the intake route and mark each mutation by the
 * server's result. Removes applied/rejected; flags conflicts for review.
 */
export async function syncNow(meta: { appVersion?: string; platform?: string; lat?: number; lng?: number } = {}): Promise<SyncOutcome> {
  if (!hasIDB()) return { synced: 0, conflicts: 0, rejected: 0, results: [] };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0, conflicts: 0, rejected: 0, offline: true, results: [] };
  const pending = await listPending();
  if (pending.length === 0) return { synced: 0, conflicts: 0, rejected: 0, results: [] };

  let synced = 0, conflicts = 0, rejected = 0;
  const results: SyncResultItem[] = [];
  for (const batch of batchMutations(pending, 100)) {
    let res: Response;
    try {
      res = await fetch('/api/internal/offline-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: getDeviceId(), ...meta, mutations: batch }),
      });
    } catch {
      // Network drop mid-flight: not a retry-consuming failure (we're offline).
      return { synced, conflicts, rejected, offline: true, results };
    }
    // Transient server failure (5xx) or auth/flag (4xx): consume a retry attempt
    // with backoff so the batch isn't hammered, and dead-letter after the cap.
    if (!res.ok) { await bumpAttempts(batch); break; }
    const data = (await res.json()) as { results?: SyncResultItem[] };
    for (const r of data.results ?? []) {
      results.push(r);
      if (r.status === 'applied') { await tx('readwrite', (s) => s.delete(r.idempotencyKey)); synced++; }
      else if (r.status === 'rejected') { await tx('readwrite', (s) => s.delete(r.idempotencyKey)); rejected++; }
      else if (r.status === 'conflict') {
        const existing = await tx<StoredMutation | undefined>('readonly', (s) => s.get(r.idempotencyKey));
        if (existing) { existing.localStatus = 'conflict'; await tx('readwrite', (s) => s.put(existing)); }
        conflicts++;
      }
    }
  }
  return { synced, conflicts, rejected, results };
}
