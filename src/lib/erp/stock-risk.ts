/**
 * Stock risk — pure classification (no I/O). On-hand availability → in-stock /
 * low / out, plus a roll-up. `erp_inventory_stock` has no reorder-point column,
 * so a documented default threshold is used until that field exists (see
 * VAN-OPS-SPRINT.md). Adapts route-sales stock-risk indicators (Pepperi/Repsly).
 */

export type StockStatus = 'out' | 'low' | 'ok';

/** Default low-stock threshold (no `reorder_point` on the stock table yet). */
export const DEFAULT_REORDER_POINT = 10;

export function stockStatus(available: number, reorderPoint?: number | null): StockStatus {
  if (!Number.isFinite(available) || available <= 0) return 'out';
  const rp = reorderPoint == null || reorderPoint <= 0 ? DEFAULT_REORDER_POINT : reorderPoint;
  return available <= rp ? 'low' : 'ok';
}

export interface StockSummary {
  total: number;
  ok: number;
  low: number;
  out: number;
}

export function summarizeStock(rows: readonly { available: number; reorderPoint?: number | null }[]): StockSummary {
  let ok = 0, low = 0, out = 0;
  for (const r of rows) {
    const s = stockStatus(r.available, r.reorderPoint);
    if (s === 'ok') ok++; else if (s === 'low') low++; else out++;
  }
  return { total: rows.length, ok, low, out };
}

const RANK: Record<StockStatus, number> = { out: 0, low: 1, ok: 2 };

/** Risk-first ordering: out → low → ok, then lowest availability first. */
export function rankStock<T extends { available: number; reorderPoint?: number | null }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => RANK[stockStatus(a.available, a.reorderPoint)] - RANK[stockStatus(b.available, b.reorderPoint)] || a.available - b.available);
}
