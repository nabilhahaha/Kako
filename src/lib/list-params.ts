/** Small helpers shared by server-paginated list screens (companies, audit).
 *  Keep this dependency-free so it can be imported from both server components
 *  and client components. */

export const DEFAULT_PAGE_SIZE = 25;

/** Next.js 15 passes `searchParams` to server components as an already-parsed
 *  record; a value can be a string, an array of strings (repeated key) or
 *  undefined. Normalise to a single string. */
export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams | undefined, key: string): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Parse a 1-based page number, clamped to >= 1. Invalid → 1. */
export function pageNumber(sp: SearchParams | undefined, key = 'page'): number {
  const n = Number.parseInt(param(sp, key) ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Compute the inclusive `.range(from, to)` bounds for a 1-based page. */
export function rangeFor(page: number, pageSize = DEFAULT_PAGE_SIZE): [number, number] {
  const from = (Math.max(1, page) - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** Build a query string from a flat record, dropping empty / default values.
 *  Used client-side to push URL state. */
export function buildQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
