import Dexie, { type EntityTable } from 'dexie';

// Offline-first local store. Every field-captured record lands here first and
// is mirrored to Supabase by the sync queue when connectivity returns.
// This is the foundation that makes Field Insights usable with no network.

export type SyncState = 'pending' | 'synced' | 'failed';

export interface LocalVisit {
  id: string; // client-generated UUID
  customer_id: string | null;
  location_id: string | null;
  visit_type: string;
  status: string;
  objective: string | null;
  summary: string | null;
  outcome: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  gps_accuracy_m: number | null;
  started_at: string | null;
  ended_at: string | null;
  sync_status: SyncState;
  updated_at: string;
}

export interface LocalBlob {
  id: string;
  visit_id: string;
  kind: 'photo' | 'voice';
  category: string | null;
  description: string | null;
  blob: Blob;
  latitude: number | null;
  longitude: number | null;
  taken_at: string;
  sync_status: SyncState;
}

// A generic outbound mutation in the sync queue. `entity`/`op` describe the
// intended change; `payload` is the row to upsert. Idempotent by `id`.
export interface SyncQueueItem {
  id: string;
  entity: string; // 'visits' | 'opportunities' | 'issues' | ...
  op: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export class FieldInsightsDB extends Dexie {
  visits!: EntityTable<LocalVisit, 'id'>;
  blobs!: EntityTable<LocalBlob, 'id'>;
  queue!: EntityTable<SyncQueueItem, 'id'>;

  constructor() {
    super('field-insights');
    this.version(1).stores({
      visits: 'id, customer_id, status, sync_status, updated_at',
      blobs: 'id, visit_id, kind, sync_status',
      queue: 'id, entity, created_at',
    });
  }
}

export const db = new FieldInsightsDB();
