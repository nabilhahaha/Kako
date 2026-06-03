/**
 * Standard list architecture (S1) — one reusable server-pagination + search
 * pattern for every large-list page. Pairs with `<ListSearch>` (URL `?q=`) and
 * `<Pager>` (URL `?page=`). A list page:
 *   const { page, q, pageSize, from, to } = parseListParams(sp);
 *   let qb = supabase.from(TABLE).select('*', { count: 'exact' }).order(ORDER);
 *   qb = applySearch(qb, q, SEARCH_COLS);
 *   const { data, count } = await qb.range(from, to);
 * and renders `<Pager total={count} .../>`. Only one page of rows is fetched,
 * so lists scale independent of table size (bounded by indexes; see docs).
 */

/** Default page size for master-data / transactional lists. */
export const DEFAULT_PAGE_SIZE = 25;

export interface ListParams {
  page: number;
  q: string;
  pageSize: number;
  from: number;
  to: number;
}

/** Parse `?page=&q=` into normalized, 0-based `from/to` range bounds. */
export function parseListParams(
  sp: { page?: string; q?: string } | undefined,
  pageSize: number = DEFAULT_PAGE_SIZE,
): ListParams {
  const page = Math.max(1, Number(sp?.page) || 1);
  const q = (sp?.q ?? '').trim();
  const from = (page - 1) * pageSize;
  return { page, q, pageSize, from, to: from + pageSize - 1 };
}

/** Build a PostgREST `or()` expression matching `q` (case-insensitive) against
 *  any of `cols`. Returns null when there's nothing to search. Strips chars that
 *  would break the `or()` grammar. */
export function buildOrIlike(q: string, cols: string[]): string | null {
  const safe = q.replace(/[%,()*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe || cols.length === 0) return null;
  return cols.map((c) => `${c}.ilike.%${safe}%`).join(',');
}

/** Minimal shape of a PostgREST filter builder that supports `.or()`. */
interface OrFilterable {
  or(filters: string): this;
}

/** Apply a multi-column case-insensitive search to a query, server-side. */
export function applySearch<Q extends OrFilterable>(query: Q, q: string, cols: string[]): Q {
  const expr = buildOrIlike(q, cols);
  return expr ? query.or(expr) : query;
}

/** Total page count for a result set (≥ 1). */
export function pageCount(total: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ── Sorting (URL `?sort=col&dir=asc|desc`) ───────────────────────────────────
export interface SortParam { column: string; ascending: boolean }

/**
 * Parse a sort request, validated against an allow-list of sortable columns
 * (prevents arbitrary-column ordering). Falls back to the entity's default sort.
 */
export function parseSort(
  sp: { sort?: string; dir?: string } | undefined,
  allowed: readonly string[],
  def: SortParam,
): SortParam {
  const col = sp?.sort;
  if (col && allowed.includes(col)) {
    return { column: col, ascending: (sp?.dir ?? 'asc') !== 'desc' };
  }
  return def;
}

// ── Count strategy for large datasets ────────────────────────────────────────
// 'exact'    — precise total (a COUNT over the filtered set). Default; fine to ~100k.
// 'planned'  — the planner's estimate (instant); use for very large tables.
// 'estimated'— planner estimate, falling back to exact for small sets.
export type CountMode = 'exact' | 'planned' | 'estimated';

/** Recommended count mode given an entity's expected size. Keeps small/medium
 *  lists exact and flips very large tables to a cheap estimate. */
export function recommendedCountMode(expectedRows: number, exactThreshold = 100_000): CountMode {
  return expectedRows <= exactThreshold ? 'exact' : 'planned';
}
