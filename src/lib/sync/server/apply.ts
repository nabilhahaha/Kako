// ============================================================================
// Server-side /api/sync push apply — exactly-once + per-entity reconciliation.
//
// Pure orchestration over an injected `ApplyDeps` (DB access), so the idempotency
// guarantee, the §14 conflict matrix, and fault handling are fully unit-testable
// without a database. The Next route (src/app/api/sync/push) wires the deps to
// Supabase; this module never imports the DB. Behind KAKO_SYNC.
// ============================================================================

import type { OutboxEntry, PushOutcome, RemoteRecord } from '../types';
import { entityKind } from '../policy';
import { lastWriteWins, fieldMerge, type LocalRecord } from '../conflict';

/** A pushed op as received over the wire (subset of OutboxEntry). */
export type PushedOp = Pick<OutboxEntry, 'clientOpId' | 'entity' | 'op' | 'pk' | 'baseVersion' | 'payload'> & {
  /** Client wall-clock of the change (drives LWW); defaults to server now. */
  updatedAt?: number;
};

export interface IngestRecord {
  clientOpId: string;
  entity: string;
  pk: string;
  appliedAt: number;
}

/** DB seam. Implementations must make putIngest + upsert atomic per op so a
 *  crash can't record ingest without the row (or vice-versa). */
export interface ApplyDeps {
  /** Has this client_op_id already been applied? (exactly-once gate) */
  hasIngest(clientOpId: string): Promise<boolean>;
  getRemote(entity: string, pk: string): Promise<RemoteRecord | null>;
  /** Persist row + ingest atomically; returns the new version. */
  commit(row: RemoteRecord, ingest: IngestRecord): Promise<{ version: number }>;
  /** Park a row needing human resolution (inventory counts). */
  flagReview(op: PushedOp, remote: RemoteRecord | null): Promise<void>;
}

function asLocal(op: PushedOp, now: number): LocalRecord {
  return {
    pk: op.pk,
    version: op.baseVersion ?? 0,
    updatedAt: op.updatedAt ?? now,
    origin: 'local',
    deleted: op.op === 'delete',
    data: op.payload,
  };
}

/**
 * Apply a batch of pushed ops. Each op is independent: a failure on one is an
 * `error` outcome (client retries that op with the SAME clientOpId), never a
 * partial duplicate. Already-ingested ops return `ok` without re-applying.
 */
export async function applyPush(
  ops: PushedOp[],
  deps: ApplyDeps,
  now: number = Date.now(),
): Promise<PushOutcome[]> {
  const outcomes: PushOutcome[] = [];

  for (const op of ops) {
    try {
      // Exactly-once: a replay of an already-applied op is a no-op success.
      if (await deps.hasIngest(op.clientOpId)) {
        outcomes.push({ clientOpId: op.clientOpId, status: 'ok' });
        continue;
      }

      const remote = await deps.getRemote(op.entity, op.pk);
      const kind = entityKind(op.entity);
      const ingest: IngestRecord = { clientOpId: op.clientOpId, entity: op.entity, pk: op.pk, appliedAt: now };

      // Append-only: never overwrites; the op is an authoritative insert.
      if (kind === 'append-only' || !remote) {
        const row: RemoteRecord = {
          entity: op.entity, pk: op.pk, version: (remote?.version ?? 0) + 1,
          updatedAt: op.updatedAt ?? now, origin: 'cloud', deleted: op.op === 'delete', data: op.payload,
        };
        const { version } = await deps.commit(row, ingest);
        outcomes.push({ clientOpId: op.clientOpId, status: 'ok', version });
        continue;
      }

      // Review (inventory counts): if the cloud moved, don't auto-apply — park it.
      if (kind === 'review') {
        if (remote.version !== (op.baseVersion ?? remote.version)) {
          await deps.flagReview(op, remote);
          outcomes.push({ clientOpId: op.clientOpId, status: 'conflict', remote });
          continue;
        }
        const row: RemoteRecord = { ...remote, version: remote.version + 1, updatedAt: op.updatedAt ?? now, deleted: op.op === 'delete', data: op.payload, origin: 'cloud' };
        const { version } = await deps.commit(row, ingest);
        outcomes.push({ clientOpId: op.clientOpId, status: 'ok', version });
        continue;
      }

      // LWW / field-merge: deterministic resolution against the current cloud row.
      const local = asLocal(op, now);
      const res = kind === 'field-merge'
        ? fieldMerge(null, local, remote)
        : lastWriteWins(local, remote);

      if (res.winner === 'remote') {
        // Cloud already has the newer truth → tell the client to accept it.
        outcomes.push({ clientOpId: op.clientOpId, status: 'conflict', remote });
        continue;
      }

      const row: RemoteRecord = {
        entity: op.entity, pk: op.pk, version: remote.version + 1,
        updatedAt: op.updatedAt ?? now, origin: 'cloud', deleted: res.deleted, data: res.data,
      };
      const { version } = await deps.commit(row, ingest);
      outcomes.push({ clientOpId: op.clientOpId, status: 'ok', version });
    } catch (e) {
      // No ingest recorded → the client safely retries this op later.
      outcomes.push({ clientOpId: op.clientOpId, status: 'error', error: (e as Error).message });
    }
  }

  return outcomes;
}
