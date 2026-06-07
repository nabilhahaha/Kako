// ============================================================================
// Purchasing Foundation — 3-way match engine (Phase 2). Pure, no DB, no I/O.
// Compares the three corners of a procurement line — Purchase Order (ordered qty
// + agreed price), Goods Receipt (received qty), and Supplier Invoice (billed qty
// + billed price) — and decides whether the invoice line may be approved for
// payment, within configurable tolerances.
//
// Control principle (AP data-integrity): never approve paying for MORE than was
// received, nor at a price materially above the PO, without an explicit override.
// Under-billing (invoiced < received) is allowed — a partial/earlier invoice.
// ============================================================================

export interface ThreeWayMatchInput {
  /** PO line: quantity ordered and the agreed unit price. */
  orderedQty: number;
  poUnitPrice: number;
  /** Goods-receipt: total quantity received against the line. */
  receivedQty: number;
  /** Supplier-invoice: quantity billed and the billed unit price. */
  invoicedQty: number;
  invoiceUnitPrice: number;
}

/** Allowed variance before a flag becomes blocking. Absolute OR percentage (the
 *  more lenient of the two that is supplied). Omitted = zero tolerance. */
export interface MatchTolerance {
  qtyAbs?: number;
  qtyPct?: number;   // percent of receivedQty
  priceAbs?: number;
  pricePct?: number; // percent of poUnitPrice
}

export type MatchFlag =
  | 'over_billed'     // invoiced qty > received qty (paying for unreceived goods) — blocking
  | 'price_variance'  // invoice price materially above PO price — blocking
  | 'over_received'   // received qty > ordered qty — advisory
  | 'under_billed';   // invoiced qty < received qty — advisory (partial invoice)

export interface ThreeWayMatchResult {
  /** Approvable for payment: no blocking variance beyond tolerance. */
  matched: boolean;
  flags: MatchFlag[];
  qtyVariance: number;       // invoicedQty - receivedQty (signed)
  priceVariance: number;     // invoiceUnitPrice - poUnitPrice (signed)
  overReceivedQty: number;   // max(0, receivedQty - orderedQty)
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** True when |value| is within the allowed absolute/percentage tolerance. */
function withinTolerance(value: number, base: number, abs?: number, pct?: number): boolean {
  const allowed = Math.max(abs ?? 0, pct != null ? Math.abs(base) * (pct / 100) : 0);
  return Math.abs(value) <= allowed + Number.EPSILON;
}

/** Match one procurement line across PO / GRN / Invoice. Pure. */
export function matchLine(input: ThreeWayMatchInput, tol: MatchTolerance = {}): ThreeWayMatchResult {
  const qtyVariance = round2(input.invoicedQty - input.receivedQty);
  const priceVariance = round2(input.invoiceUnitPrice - input.poUnitPrice);
  const overReceivedQty = round2(Math.max(0, input.receivedQty - input.orderedQty));

  const flags: MatchFlag[] = [];

  // Over-billing (invoiced > received) beyond tolerance is blocking.
  const overBilledBlocking = qtyVariance > 0 && !withinTolerance(qtyVariance, input.receivedQty, tol.qtyAbs, tol.qtyPct);
  if (overBilledBlocking) flags.push('over_billed');
  else if (qtyVariance < 0) flags.push('under_billed'); // advisory only

  // Price variance (in either direction) beyond tolerance is blocking.
  const priceBlocking = !withinTolerance(priceVariance, input.poUnitPrice, tol.priceAbs, tol.pricePct);
  if (priceVariance !== 0 && priceBlocking) flags.push('price_variance');

  // Over-receipt vs the PO is advisory (an inventory/PO concern, not an AP block).
  if (overReceivedQty > 0) flags.push('over_received');

  const matched = !overBilledBlocking && !(priceVariance !== 0 && priceBlocking);
  return { matched, flags, qtyVariance, priceVariance, overReceivedQty };
}
