/** Pure helper backing the Price Book "resolved-price preview": map raw
 *  erp_prices rows into the shape the shared pricing engine expects, then resolve
 *  the unit price for a uom/qty. Kept here (in src/lib/erp) so it is covered by
 *  the erp test gate and can be reused server- or client-side without importing
 *  React. Mirrors erp_resolve_price precedence via uom-pricing.resolvePrice. */
import { resolvePrice, type PriceRow } from './uom-pricing';

export interface RawPriceRow {
  product_id: string;
  uom: string;
  channel_id: string | null;
  customer_id: string | null;
  min_qty: number;
  price: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

/** Map raw DB rows for a single product into pricing-engine PriceRow inputs. */
export function toPriceRows(rows: readonly RawPriceRow[], productId: string): PriceRow[] {
  return rows
    .filter((r) => r.product_id === productId)
    .map((r) => ({
      uom: r.uom,
      channelId: r.channel_id,
      customerId: r.customer_id,
      minQty: Number(r.min_qty),
      price: Number(r.price),
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      isActive: r.is_active,
    }));
}

/** Resolve the previewed unit price for a product/uom/qty over raw rows.
 *  `fallback` (catalog sell_price × factor) is used when no row matches. */
export function previewResolvedPrice(
  rows: readonly RawPriceRow[],
  productId: string,
  uom: string,
  qty: number,
  opts: { customerId?: string | null; channelId?: string | null; date?: string; fallback?: number } = {},
): number {
  return resolvePrice(
    toPriceRows(rows, productId),
    { uom, qty, customerId: opts.customerId ?? null, channelId: opts.channelId ?? null, date: opts.date },
    opts.fallback ?? 0,
    [],
  );
}
