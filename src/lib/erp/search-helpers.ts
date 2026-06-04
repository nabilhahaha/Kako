/**
 * Search excellence — pure helpers (no I/O), reused by the command palette and
 * the entity comboboxes. Highlighting, grouping, and result ranking are pure and
 * unit-tested so the search UX can improve without touching data paths or RLS.
 */

/** A search result with a type bucket for grouping (e.g. customer/product/invoice). */
export interface SearchResultLike {
  id: string;
  label: string;
  type: string;
  href?: string;
}

/** Split `text` into segments marking the (case-insensitive) match of `query`,
 *  for highlighting in the UI. Returns one segment when there's no match. */
export function highlightMatch(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const segments: { text: string; match: boolean }[] = [];
  let i = 0;
  let idx = lower.indexOf(ql, i);
  if (idx === -1) return [{ text, match: false }];
  while (idx !== -1) {
    if (idx > i) segments.push({ text: text.slice(i, idx), match: false });
    segments.push({ text: text.slice(idx, idx + ql.length), match: true });
    i = idx + ql.length;
    idx = lower.indexOf(ql, i);
  }
  if (i < text.length) segments.push({ text: text.slice(i), match: false });
  return segments;
}

/** Group results by `type`, preserving first-seen type order and item order. */
export function groupByType<T extends SearchResultLike>(results: readonly T[]): { type: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const r of results) {
    if (!map.has(r.type)) {
      map.set(r.type, []);
      order.push(r.type);
    }
    map.get(r.type)!.push(r);
  }
  return order.map((type) => ({ type, items: map.get(type)! }));
}

/** Relevance score for ranking: exact > prefix > word-prefix > substring > none,
 *  with shorter labels breaking ties (closer match). Higher = better. */
export function scoreResult(label: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const l = label.toLowerCase();
  if (l === q) return 1000;
  if (l.startsWith(q)) return 800 - Math.min(l.length, 200);
  if (l.split(/\s+/).some((w) => w.startsWith(q))) return 600 - Math.min(l.length, 200);
  if (l.includes(q)) return 400 - Math.min(l.length, 200);
  return 0;
}

/** Rank results best-first by relevance to `query` (stable for equal scores). */
export function rankResults<T extends SearchResultLike>(results: readonly T[], query: string): T[] {
  return results
    .map((r, i) => ({ r, i, s: scoreResult(r.label, query) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

// ── Recent searches (client-side; pure list ops, storage handled by the caller) ──

const RECENT_LIMIT = 5;

/** Add a term to a recent-searches list (dedup, most-recent-first, capped). */
export function pushRecent(list: readonly string[], term: string, limit = RECENT_LIMIT): string[] {
  const t = term.trim();
  if (!t) return [...list].slice(0, limit);
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, limit);
}
