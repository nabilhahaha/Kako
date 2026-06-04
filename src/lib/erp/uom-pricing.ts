/**
 * FMCG Value Acceleration Wave 1 — UOM conversion + price resolution (pure).
 *
 * Client-safe mirror of the DB helpers erp_uom_to_base() / erp_resolve_price()
 * (migration 0137), so order/cart UIs can show unit-aware quantities and prices
 * without a round-trip. The DB remains the source of truth on write.
 */

export interface ProductUom {
  uom: string;
  /** Number of BASE units in 1 of this uom (base uom = 1). */
  factor: number;
  isCase?: boolean;
}

export interface PriceRow {
  uom: string;
  channelId?: string | null;
  customerId?: string | null;
  minQty: number;
  price: number;
  effectiveFrom: string; // ISO date
  effectiveTo?: string | null;
  isActive: boolean;
}

/** Convert a quantity expressed in `uom` to BASE units. Unknown uom ⇒ factor 1. */
export function uomToBase(qty: number, uom: string, uoms: readonly ProductUom[]): number {
  const f = uoms.find((u) => u.uom === uom)?.factor ?? 1;
  return (qty || 0) * f;
}

/** factor for a uom (1 if unknown / base). */
export function uomFactor(uom: string, uoms: readonly ProductUom[]): number {
  return uoms.find((u) => u.uom === uom)?.factor ?? 1;
}

export interface PriceQuery {
  uom: string;
  qty: number;
  customerId?: string | null;
  channelId?: string | null;
  date?: string; // ISO; defaults today
}

/**
 * Resolve the unit price for a uom, mirroring erp_resolve_price precedence:
 * active rows whose effective window covers the date and whose minQty <= qty;
 * customer-specific > channel-specific > generic; then highest qualifying minQty.
 * Falls back to `fallbackSellPrice * factor(uom)` when no price row matches.
 */
export function resolvePrice(
  rows: readonly PriceRow[],
  q: PriceQuery,
  fallbackSellPrice: number,
  uoms: readonly ProductUom[],
): number {
  const date = q.date ?? new Date().toISOString().slice(0, 10);
  const qty = q.qty ?? 1;
  const candidates = rows.filter(
    (r) =>
      r.uom === q.uom &&
      r.isActive &&
      r.effectiveFrom <= date &&
      (r.effectiveTo == null || r.effectiveTo >= date) &&
      r.minQty <= qty &&
      (r.customerId == null || r.customerId === q.customerId) &&
      (r.channelId == null || r.channelId === q.channelId),
  );
  if (candidates.length > 0) {
    const score = (r: PriceRow) =>
      (r.customerId != null && r.customerId === q.customerId ? 1000000 : 0) +
      (r.channelId != null && r.channelId === q.channelId ? 1000 : 0) +
      r.minQty;
    candidates.sort((a, b) => score(b) - score(a));
    return candidates[0].price;
  }
  return fallbackSellPrice * uomFactor(q.uom, uoms);
}
