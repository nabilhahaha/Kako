// ============================================================================
// Offline Sync — domain types (Phase 7B). Country/company-agnostic. The field
// client queues mutations offline; they sync idempotently with a conflict policy.
// Maps onto erp_offline_mutations + erp_device_sessions.
// ============================================================================

export type SyncOperation = 'create' | 'update' | 'delete';

export type SyncStatus = 'pending' | 'applied' | 'conflict' | 'rejected';

/** One queued offline mutation (one row in erp_offline_mutations). */
export interface OfflineMutation {
  idempotencyKey: string;     // client-generated UUID — the dedup key
  deviceId: string;
  userId: string;
  entity: string;             // 'visit' | 'order' | 'collection' | 'van_expense' | ...
  entityId?: string | null;   // target row (update/delete); null for create
  operation: SyncOperation;
  payload: Record<string, unknown>;
  clientSeq: number;          // per-device monotonically increasing order
  clientTs: string;          // ISO — when the action happened on the device
  baseVersion?: string | null; // server version/updated_at the client based its edit on
}

/**
 * Conflict policy per entity: 'last_write_wins' (field-level merge by timestamp),
 * or 'server_authoritative' (server value wins — for protected entities like
 * stock/cash where the device must not overwrite ledgered state).
 */
export type ConflictPolicy = 'last_write_wins' | 'server_authoritative';

/** Default policies — protected ledgered entities are server-authoritative. */
export const DEFAULT_CONFLICT_POLICIES: Record<string, ConflictPolicy> = {
  van_cash_reconciliation: 'server_authoritative',
  van_inventory: 'server_authoritative',
  invoice: 'server_authoritative',
  collection: 'server_authoritative',
};

export interface ServerRecord {
  entity: string;
  entityId: string;
  version: string;            // server updated_at / version token
  fields: Record<string, unknown>;
}
