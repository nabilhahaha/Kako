// ============================================================================
// Search OS — query service (V1). Calls the erp_search ranking RPC (RLS tenant-
// isolates under SECURITY INVOKER), gates categories by REUSED permission keys,
// and groups hits into categorized results. Entity-neutral; pure grouping helper
// is unit-tested. No semantic/AI (out of V1).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { SEARCH_PROVIDERS, type SearchProvider } from './providers';
import { SEARCH_ENTITY_TYPES, type SearchEntityType, type SearchHit, type SearchCategory, type SearchResult, type MatchKind } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** Raw row shape returned by the erp_search RPC. */
interface RawHit {
  entity_type: string; entity_id: string; title: string; subtitle: string | null;
  href: string; metadata: Record<string, unknown> | null; score: number; match_kind: string;
}

export interface SearchOptions {
  /** Permission predicate (reused capability keys). */
  can: (key: string) => boolean;
  /** Restrict to specific categories (scoped search); default = all permitted. */
  types?: SearchEntityType[];
  /** Max hits per category in grouped (global) mode. */
  perCategory?: number;
  /** Total row cap fetched from the RPC. */
  limit?: number;
}

/** Categories the caller may search: RLS-only (null key) or a held capability. */
export function allowedTypes(can: (key: string) => boolean): SearchEntityType[] {
  return (Object.values(SEARCH_PROVIDERS) as SearchProvider[])
    .filter((p) => p.permissionKey == null || can(p.permissionKey))
    .map((p) => p.entityType);
}

/** Pure: group ranked rows into categories (provider order), capping per category. */
export function groupHits(rows: RawHit[], perCategory: number): SearchCategory[] {
  const byType = new Map<SearchEntityType, SearchHit[]>();
  for (const r of rows) {
    const t = r.entity_type as SearchEntityType;
    if (!SEARCH_ENTITY_TYPES.includes(t)) continue;
    const hit: SearchHit = {
      entityType: t, entityId: r.entity_id, title: r.title, subtitle: r.subtitle ?? null,
      href: r.href, metadata: r.metadata ?? {}, score: Number(r.score) || 0, matchKind: (r.match_kind as MatchKind) ?? 'fuzzy',
    };
    const arr = byType.get(t) ?? [];
    arr.push(hit);
    byType.set(t, arr);
  }
  const cats: SearchCategory[] = [];
  for (const t of SEARCH_ENTITY_TYPES) {            // stable provider/display order
    const all = byType.get(t);
    if (!all || all.length === 0) continue;
    cats.push({ entityType: t, count: all.length, hits: perCategory > 0 ? all.slice(0, perCategory) : all });
  }
  return cats;
}

/** Run a search: gate categories → RPC → grouped categorized results. */
export async function search(db: Db, query: string, opts: SearchOptions): Promise<SearchResult> {
  const q = (query || '').trim();
  if (!q) return { query: '', categories: [], total: 0 };

  let allowed = allowedTypes(opts.can);
  if (opts.types && opts.types.length) allowed = allowed.filter((t) => opts.types!.includes(t));
  if (allowed.length === 0) return { query: q, categories: [], total: 0 };

  const { data, error } = await db.rpc('erp_search', {
    p_query: q, p_types: allowed, p_limit: opts.limit ?? 50,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RawHit[];
  const categories = groupHits(rows, opts.perCategory ?? 5);
  const total = categories.reduce((n, c) => n + c.count, 0);
  return { query: q, categories, total };
}
