// ============================================================================
// Search OS — backfill / reindex (V1). Projects source rows into the unified
// index via the provider registry (the single source of column knowledge). Run
// by the internal reindex route (pg_cron) under the service role. P2 adds
// event-driven incremental indexing; V1 is full backfill + reconcile.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { BACKFILL_PROVIDERS, SEARCH_PROVIDERS, type SearchProvider } from './providers';
import type { SearchDocument, SearchEntityType } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

const PAGE = 500;

/** branch_id → company_id map (for branch-scoped entities). */
async function branchCompanyMap(db: Db): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data } = await db.from('erp_branches' as never).select('id,company_id');
  for (const b of ((data ?? []) as { id: string; company_id: string }[])) m.set(b.id, b.company_id);
  return m;
}

/** Build the index document for one source row (resolving company via the branch map). */
function buildDoc(provider: SearchProvider, row: Record<string, unknown>, branches: Map<string, string>): SearchDocument {
  const p = provider.toDocument(row);
  const companyId = provider.companyVia === 'branch'
    ? (p.branchId ? branches.get(p.branchId) ?? null : null)
    : p.companyIdRaw;
  return {
    company_id: companyId, branch_id: p.branchId, entity_type: provider.entityType, entity_id: p.entityId,
    title: p.title || p.entityId, subtitle: p.subtitle, body: p.body, identifiers: p.identifiers,
    href: p.href, permission_key: provider.permissionKey, metadata: p.metadata,
  };
}

/** P2 incremental: (re)project a SINGLE source record into the index (event-driven).
 *  Upserts the document; if the source row is gone, deletes the document. */
export async function projectOne(db: Db, entityType: SearchEntityType, entityId: string): Promise<void> {
  const provider = SEARCH_PROVIDERS[entityType];
  if (!provider || !provider.backfill) return;                  // unsupported / not indexed
  const { data } = await db.from(provider.table as never).select(provider.select).eq('id', entityId).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) {
    await db.from('erp_search_documents' as never).delete().eq('entity_type', entityType).eq('entity_id', entityId);
    return;
  }
  let branches = new Map<string, string>();
  if (provider.companyVia === 'branch') {
    const bid = (row.branch_id as string) ?? null;
    if (bid) {
      const { data: b } = await db.from('erp_branches' as never).select('company_id').eq('id', bid).maybeSingle();
      if (b) branches.set(bid, (b as { company_id: string }).company_id);
    }
  }
  const doc = buildDoc(provider, row, branches);
  await db.from('erp_search_documents' as never).upsert(doc as never, { onConflict: 'entity_type,entity_id' });
}

/** Reindex one provider's entity. Returns the number of documents upserted. */
export async function reindexEntity(db: Db, provider: SearchProvider, branches: Map<string, string>): Promise<number> {
  let from = 0; let upserted = 0;
  for (;;) {
    const { data, error } = await db.from(provider.table as never)
      .select(provider.select).range(from, from + PAGE - 1);
    if (error) throw new Error(`${provider.entityType}: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length === 0) break;

    const docs: SearchDocument[] = rows.map((row) => buildDoc(provider, row, branches));
    // search_vector / trgm_text are maintained by the DB trigger on upsert.
    const { error: upErr } = await db.from('erp_search_documents' as never)
      .upsert(docs as never, { onConflict: 'entity_type,entity_id' });
    if (upErr) throw new Error(`${provider.entityType} upsert: ${upErr.message}`);
    upserted += docs.length;

    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return upserted;
}

/** Reindex all V1 backfill entities. Returns per-entity counts. */
export async function reindexAll(db: Db): Promise<Record<string, number>> {
  const branches = await branchCompanyMap(db);
  const out: Record<string, number> = {};
  for (const provider of BACKFILL_PROVIDERS) {
    try { out[provider.entityType] = await reindexEntity(db, provider, branches); }
    catch (e) { out[provider.entityType] = -1; console.error('[search] reindex failed', provider.entityType, e); }
  }
  return out;
}
