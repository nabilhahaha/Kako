import Dexie, { type EntityTable } from 'dexie';

// Offline-first local store. Field-captured records are written here first and
// mirrored to Supabase by the sync engine (see sync.ts) when online.

export type SyncState = 'pending' | 'synced' | 'failed';

export interface LocalVisit {
  id: string; // client-generated UUID
  customer_id: string | null;
  customer_name: string | null; // denormalized for offline display
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
  area_id: string | null;
  region_id: string | null;
  sync_status: SyncState;
  updatedAt: string;
}

// A pending outbound mutation. Idempotent by row id (insert uses upsert).
export interface OutboxItem {
  id: string;          // = the target row id (so retries are idempotent)
  table: string;       // target Postgres table
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export class FieldInsightsDB extends Dexie {
  visits!: EntityTable<LocalVisit, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;

  constructor() {
    super('field-insights');
    this.version(2).stores({
      visits: 'id, customer_id, status, sync_status, updatedAt',
      outbox: 'id, table, createdAt',
      // drop the Phase-0 placeholder stores
      blobs: null,
      queue: null,
    });
  }
}

export const db = new FieldInsightsDB();
