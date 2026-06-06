/** Fashion pack — POS product search/ranking (pure, client-safe, no DB).
 *  Powers the cashier autocomplete: a single query box that matches a variant by
 *  barcode, product code (SKU) or name, ranked so the most likely hit is first.
 *  Kept dependency-free and deterministic so it can be unit-tested and reused. */

export interface SearchableProduct {
  product_id: string;
  /** Product code = the variant SKU (erp_products_catalog.code). */
  code: string;
  name: string;
  /** EAN-13 barcode, or '' when none is assigned. */
  barcode: string;
}

export interface RankedProduct<T extends SearchableProduct> {
  item: T;
  score: number;
}

/** Lowercased, trimmed; collapses internal whitespace for stable matching. */
function norm(s: string | null | undefined): string {
  return (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Relevance score for one product against a query. Higher is better; 0 = no match.
 * Ordering intent (best → worst):
 *   exact barcode → exact code → barcode prefix → code prefix → name prefix →
 *   all-tokens-in-name → name substring → code substring → barcode substring.
 */
export function scoreProduct<T extends SearchableProduct>(item: T, query: string): number {
  const q = norm(query);
  if (!q) return 0;
  const code = norm(item.code);
  const bc = norm(item.barcode);
  const name = norm(item.name);

  if (bc && bc === q) return 100;
  if (code && code === q) return 95;
  if (bc && bc.startsWith(q)) return 80;
  if (code && code.startsWith(q)) return 75;
  if (name && name.startsWith(q)) return 70;

  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1 && name && tokens.every((tk) => name.includes(tk))) return 60;

  if (name && name.includes(q)) return 50;
  if (code && code.includes(q)) return 40;
  if (bc && bc.includes(q)) return 30;
  return 0;
}

/**
 * Rank and return the best matches for a query, most-relevant first. Ties break
 * alphabetically by name for a stable, predictable list. Returns [] for a blank
 * query so the dropdown stays closed until the cashier types.
 */
export function searchProducts<T extends SearchableProduct>(
  items: readonly T[],
  query: string,
  limit = 8,
): T[] {
  if (!norm(query)) return [];
  const ranked: RankedProduct<T>[] = [];
  for (const item of items) {
    const score = scoreProduct(item, query);
    if (score > 0) ranked.push({ item, score });
  }
  ranked.sort((a, b) => b.score - a.score || norm(a.item.name).localeCompare(norm(b.item.name)));
  return ranked.slice(0, Math.max(0, limit)).map((r) => r.item);
}

/**
 * Resolve a scanner / exact-entry hit: the single product whose barcode or code
 * equals the query exactly. Used so pressing Enter after a scan adds the item
 * immediately without navigating the suggestion list. Returns null when there is
 * no unambiguous exact match.
 */
export function exactScanMatch<T extends SearchableProduct>(
  items: readonly T[],
  query: string,
): T | null {
  const q = norm(query);
  if (!q) return null;
  const byBarcode = items.filter((it) => norm(it.barcode) && norm(it.barcode) === q);
  if (byBarcode.length === 1) return byBarcode[0];
  const byCode = items.filter((it) => norm(it.code) === q);
  if (byCode.length === 1) return byCode[0];
  return null;
}
