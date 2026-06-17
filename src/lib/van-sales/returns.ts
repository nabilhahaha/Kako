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

/** A line in the return Review panel — what the rep confirms before submitting. */
export interface ReturnReviewRow {
  product_id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Build the review rows from the server-priced preview lines, resolving each
 * product's display name from a lookup (product_id → localized name). Every
 * priced line yields exactly one review row (so the selected items ALWAYS appear
 * in the review), with its line total = round2(qty × price). Pure.
 */
export function buildReturnReviewRows(
  priced: PricedReturnLine[],
  names: Record<string, string>,
): ReturnReviewRow[] {
  return (priced ?? []).map((l) => ({
    product_id: l.product_id,
    name: names[l.product_id] ?? l.product_id,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    lineTotal: round2(Number(l.quantity) * Number(l.unit_price)),
  }));
}
