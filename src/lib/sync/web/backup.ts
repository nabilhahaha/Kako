// ============================================================================
// Backup / export for the offline-safe edition (design §5).
//
// Local backup  = the durable outbox (pending + failed + synced journal) and the
//                 local mirror of synced rows — exportable by an admin even with
//                 no connection.
// Cloud backup  = a server-produced snapshot (designed; fetched via the sync API
//                 when KAKO_SYNC is enabled).
// Every entry carries useful metadata: timestamp, user, company, entity, sync
// status, operation id.
// ============================================================================

import type { OutboxEntry, RemoteRecord } from '../types';
import type { WebLocalStore } from './web-store';

export interface BackupActor {
  userId: string | null;
  companyId: string | null;
}

export interface BackupItem {
  operationId: string;
  entity: string;
  op: string;
  pk: string;
  syncStatus: string;
  attempts: number;
  timestamp: string; // ISO
  payload: Record<string, unknown>;
}

export interface LocalBackup {
  kind: 'local';
  version: 1;
  meta: { exportedAt: string; userId: string | null; companyId: string | null; counts: Record<string, number> };
  pending: BackupItem[];
  records: RemoteRecord[];
}

function toItem(e: OutboxEntry): BackupItem {
  return {
    operationId: e.clientOpId,
    entity: e.entity,
    op: e.op,
    pk: e.pk,
    syncStatus: e.status,
    attempts: e.attempts,
    timestamp: new Date(e.createdAt).toISOString(),
    payload: e.payload,
  };
}

/** Build a durable local backup of all outbox ops + the synced-row mirror. */
export async function buildLocalBackup(store: WebLocalStore, actor: BackupActor): Promise<LocalBackup> {
  const [outbox, records] = await Promise.all([store.listOutbox(), store.listRecords()]);
  const counts = outbox.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    kind: 'local',
    version: 1,
    meta: { exportedAt: new Date().toISOString(), userId: actor.userId, companyId: actor.companyId, counts },
    pending: outbox.map(toItem),
    records,
  };
}

/** Serialize a backup to a downloadable JSON string. */
export function serializeBackup(backup: LocalBackup): string {
  return JSON.stringify(backup, null, 2);
}

/** Suggested filename for a backup export. */
export function backupFilename(actor: BackupActor, at = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const who = actor.companyId ? `${actor.companyId}_` : '';
  return `vantora-local-backup_${who}${stamp}.json`;
}
