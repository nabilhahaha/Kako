// ============================================================================
// Van Sell — PURE core (no I/O). The field rep sells off the van: lines carry
// only product + quantity + an optional discount; the AUTHORITATIVE unit price
// is resolved server-side (erp_resolve_price) and the whole transaction is
// committed atomically by the erp_van_sell RPC. These pure helpers normalize the
// input and validate the discount cap so the thin server wrapper can fail fast
// with friendly errors BEFORE the RPC — the RPC remains the sole authority.
//
// Math mirrors src/lib/erp/sales-calc.ts exactly (net = gross − discount + tax),
// reused here so van-sell totals never diverge from desktop invoicing.
// ============================================================================

import { computeTotals, type LineInput, type DocumentTotals } from '@/lib/erp/sales-calc';

/** What the client submits per line — never a price (resolved server-side).
 *  `uom` is the unit the rep entered (e.g. 'carton'); null/absent = base unit. */
export interface VanSellLineInput {
  product_id: string;
  quantity: number;
  discount_pct?: number;
  uom?: string | null;
}

/** A line after the server resolved its price + tax — input to the totals math. */
export interface PricedVanSellLine extends LineInput {}

/**
 * Drop empty/invalid lines and coerce discount to a sane non-negative number.
 * Keeps only lines with a product and a positive quantity (same contract as the
 * invoice action's `lines.filter(...)`). Pure.
 */
export function normalizeVanSellLines(lines: VanSellLineInput[]): Required<VanSellLineInput>[] {
  return lines
    .filter((l) => l.product_id && Number(l.quantity) > 0)
    .map((l) => ({
      product_id: l.product_id,
      quantity: Number(l.quantity),
      discount_pct: Math.max(0, Number(l.discount_pct ?? 0)),
      uom: (l.uom ?? '').trim() || null,
    }));
}

/** A discount is within cap when no cap is set (null) or it does not exceed it. Pure. */
export function discountWithinCap(discountPct: number, cap: number | null): boolean {
  if (cap === null || cap === undefined) return true;
  return Number(discountPct) <= Number(cap);
}

/**
 * The first line whose discount exceeds the cap, or `null` when all are within
 * cap. Mirrors the RPC's per-line check so the wrapper can reject early. Pure.
 */
export function firstDiscountOverCap(
  lines: VanSellLineInput[],
  cap: number | null,
): VanSellLineInput | null {
  if (cap === null || cap === undefined) return null;
  return lines.find((l) => !discountWithinCap(Number(l.discount_pct ?? 0), cap)) ?? null;
}

/**
 * Van-sell document totals from server-priced lines. Thin, intentional wrapper
 * over the shared `computeTotals` so the van-sell path and the invoice path
 * produce identical numbers. Pure.
 */
export function computeVanSellTotals(lines: PricedVanSellLine[]): DocumentTotals {
  return computeTotals(lines);
}
