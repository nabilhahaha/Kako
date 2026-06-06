// ============================================================================
// Supabase-backed implementations of the sync server seams (ApplyDeps/PullDeps).
//
// Talks to the cloud mirror proposed in
// docs/architecture/sync/proposed-migrations/0001_sync.sql:
//   • sync_ingest  — client_op_id dedupe (exactly-once)
//   • sync_rows    — per-(company,entity,pk) mirror with a monotonic `seq`
//   • sync_commit()— atomic upsert(row)+insert(ingest), version-checked
//
// These tables do NOT exist until that migration is reviewed + applied, and the
// routes are gated behind KAKO_SYNC, so this is inert in production today.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteRecord } from '../types';
import type { ApplyDeps, IngestRecord } from './apply';
import type { PullDeps } from './pull';

// The mirror tables are not in the generated DB types yet → use a loose client
// so any configured Supabase client (cloud or offline) is assignable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

interface SyncRow {
  company_id: string; entity: string; pk: string; version: number;
  updated_at: number; origin: 'local' | 'cloud'; deleted: boolean;
  data: Record<string, unknown>; seq: number;
}

const toRemote = (r: SyncRow): RemoteRecord => ({
  entity: r.entity, pk: r.pk, version: r.version, updatedAt: r.updated_at,
  origin: r.origin, deleted: r.deleted, data: r.data,
});

export function makeApplyDeps(db: Db, companyId: string): ApplyDeps {
  const t = (name: string) => db.from(name as never);
  return {
    async hasIngest(clientOpId) {
      const { data } = await t('sync_ingest').select('client_op_id').eq('client_op_id', clientOpId).maybeSingle();
      return !!data;
    },
    async getRemote(entity, pk) {
      const { data } = await t('sync_rows').select('*')
        .eq('company_id', companyId).eq('entity', entity).eq('pk', pk).maybeSingle();
      return data ? toRemote(data as unknown as SyncRow) : null;
    },
    async commit(row: RemoteRecord, ingest: IngestRecord) {
      // Atomic upsert(row)+insert(ingest) with optimistic version check.
      const { data, error } = await db.rpc('sync_commit', {
        p_company_id: companyId,
        p_row: { entity: row.entity, pk: row.pk, version: row.version, updated_at: row.updatedAt, origin: 'cloud', deleted: row.deleted, data: row.data },
        p_ingest: { client_op_id: ingest.clientOpId, entity: ingest.entity, pk: ingest.pk, applied_at: ingest.appliedAt },
      });
      if (error) throw new Error(error.message);
      return { version: (data as { version: number }).version ?? row.version };
    },
    async flagReview(op, remote) {
      await db.rpc('sync_flag_review', {
        p_company_id: companyId, p_entity: op.entity, p_pk: op.pk, p_client_op_id: op.clientOpId,
        p_base_version: op.baseVersion ?? null, p_proposed: op.payload,
        p_remote_version: remote?.version ?? 0, p_remote: remote?.data ?? {},
      });
    },
  };
}

import type { ReviewItem } from './review';

interface ReviewRow {
  id: number; company_id: string; entity: string; pk: string; client_op_id: string;
  base_version: number | null; proposed: Record<string, unknown>;
  remote_version: number; remote: Record<string, unknown>;
}

/** Open (unresolved) inventory-count conflicts for a company. */
export async function fetchOpenReviews(db: Db, companyId: string): Promise<ReviewItem[]> {
  const { data } = await db.from('sync_review' as never).select('*')
    .eq('company_id', companyId).is('resolved_at', null).order('created_at', { ascending: true });
  return ((data ?? []) as unknown as ReviewRow[]).map((r) => ({
    id: r.id, companyId: r.company_id, entity: r.entity, pk: r.pk, clientOpId: r.client_op_id,
    baseVersion: r.base_version, proposed: r.proposed, remoteVersion: r.remote_version, remote: r.remote,
  }));
}

export async function fetchReview(db: Db, companyId: string, id: number): Promise<ReviewItem | null> {
  const { data } = await db.from('sync_review' as never).select('*')
    .eq('company_id', companyId).eq('id', id).maybeSingle();
  if (!data) return null;
  const r = data as unknown as ReviewRow;
  return { id: r.id, companyId: r.company_id, entity: r.entity, pk: r.pk, clientOpId: r.client_op_id, baseVersion: r.base_version, proposed: r.proposed, remoteVersion: r.remote_version, remote: r.remote };
}

export async function markReviewResolved(db: Db, companyId: string, id: number, resolution: string): Promise<void> {
  await db.from('sync_review' as never).update({ resolved_at: new Date().toISOString(), resolution } as never)
    .eq('company_id', companyId).eq('id', id);
}

export function makePullDeps(db: Db, companyId: string): PullDeps {
  return {
    async getChanges(entity, sinceSeq, limit) {
      const { data } = await db.from('sync_rows' as never).select('*')
        .eq('company_id', companyId).eq('entity', entity).gt('seq', sinceSeq)
        .order('seq', { ascending: true }).limit(limit);
      const rows = (data ?? []) as unknown as SyncRow[];
      const maxSeq = rows.reduce((m, r) => Math.max(m, r.seq), sinceSeq);
      return { rows: rows.map(toRemote), maxSeq };
    },
  };
}

/** All synced rows for a company (cloud backup/export snapshot). */
export async function fetchCloudSnapshot(db: Db, companyId: string): Promise<RemoteRecord[]> {
  const { data } = await db.from('sync_rows' as never).select('*').eq('company_id', companyId);
  return ((data ?? []) as unknown as SyncRow[]).map(toRemote);
}
