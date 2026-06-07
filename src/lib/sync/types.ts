// ============================================================================
// Offline-first sync — core types (platform-agnostic, dependency-free).
//
// These types describe the local journal (outbox), remote records, and push
// outcomes used by the sync engine. They are shared by web/macOS/Windows. This
// module is STANDALONE — not imported by the running app yet (see
// docs/architecture/offline-first-sync.md). No runtime behavior changes.
// ============================================================================

export type SyncOp = 'insert' | 'update' | 'delete';

export type OutboxStatus = 'pending' | 'inflight' | 'synced' | 'failed' | 'conflict';

/** Per-entity conflict-resolution strategy (see design §8). */
export type ConflictPolicy = 'server-wins' | 'client-wins' | 'last-write-wins' | 'field-merge';

/** A durable local journal entry — one business mutation awaiting sync. */
export interface OutboxEntry {
  id: number;
  entity: string;
  op: SyncOp;
  pk: string;
  /** Stable idempotency key (uuid) — also the row's idempotency_key. Replaying
   *  a push with the same id is a no-op on the server (exactly-once effect). */
  clientOpId: string;
  /** The row sync_version this change was derived from (null for inserts). */
  baseVersion: number | null;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  /** Epoch ms; the entry is eligible for (re)send when now >= nextAttemptAt. */
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
}

/** A row as it exists remotely (cloud) — the unit of pull + conflict checks. */
export interface RemoteRecord {
  entity: string;
  pk: string;
  version: number;
  /** Epoch ms of the last write (drives last-write-wins). */
  updatedAt: number;
  origin: 'local' | 'cloud';
  deleted: boolean;
  data: Record<string, unknown>;
}

/** Result of pushing a single outbox op to the cloud. */
export type PushOutcome =
  | { clientOpId: string; status: 'ok'; version?: number }
  | { clientOpId: string; status: 'conflict'; remote: RemoteRecord }
  | { clientOpId: string; status: 'error'; error: string };
