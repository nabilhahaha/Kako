// ============================================================================
// Van Return — PURE core (no I/O). A field return goes back to the rep's van.
// The client submits only product + quantity; the credited unit price is
// resolved server-side (original invoice line, else erp_resolve_price) and the
// whole return is committed atomically by erp_van_return. These helpers normalize
// the input and total priced lines so the thin server wrapper can validate fast —
// the RPC remains the sole authority. Money math matches sales-calc's round2.
// ============================================================================

/** What the client submits per return line — never a price (server-resolved). */
export interface ReturnLineInput {
  product_id: string;
  quantity: number;
}

/** A return line after the server resolved its credited unit price. */
export interface PricedReturnLine {
  product_id: string;
  quantity: number;
  unit_price: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Keep only lines with a product and a positive quantity (same contract as the
 * RPC's per-line skip). Pure.
 */
export function normalizeReturnLines(lines: ReturnLineInput[]): ReturnLineInput[] {
  return lines
    .filter((l) => l.product_id && Number(l.quantity) > 0)
    .map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) }));
}

/**
 * Credited total of priced return lines (Σ round2(qty × price)), rounded — the
 * same accumulation erp_van_return does. Pure.
 */
export function computeReturnTotal(lines: PricedReturnLine[]): number {
  return round2(lines.reduce((s, l) => s + round2(Number(l.quantity) * Number(l.unit_price)), 0));
}
