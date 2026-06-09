// ============================================================================
// Van Sales — load reporting (Phase B). Pure, no I/O. Aggregates the loading
// loop into the FMCG metrics: requested vs approved vs received per line, the
// variance, and service level (fill rate / delivery accuracy). A server loader
// supplies the rows from erp_stock_request(_lines) + erp_van_load_confirmation
// (_lines); these pure functions do the math (testable, deterministic).
// ============================================================================

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const pct = (num: number, den: number): number => (den > 0 ? r3(num / den) : 0);

export interface RequestQty {
  productId: string;
  requested: number;
  /** Supervisor-approved qty; null = not adjusted → approved equals requested. */
  approved: number | null;
}

export interface ReceivedQty {
  productId: string;
  loaded: number;
  accepted: number;
}

export interface FulfillmentRow {
  productId: string;
  requested: number;
  approved: number; // approved ?? requested
  received: number; // accepted
  /** received − approved (negative = short of the approved load). */
  varianceVsApproved: number;
  /** received − requested (negative = short of what the salesman asked for). */
  varianceVsRequested: number;
}

/** Per-product requested vs approved vs received + variances. Pure. Products that
 *  appear only in the received set (supervisor-added) are included too. */
export function loadFulfillment(req: readonly RequestQty[], rec: readonly ReceivedQty[]): FulfillmentRow[] {
  const recByP = new Map(rec.map((r) => [r.productId, r]));
  const seen = new Set<string>();
  const rows: FulfillmentRow[] = [];
  for (const r of req) {
    seen.add(r.productId);
    const approved = r.approved ?? r.requested;
    const received = recByP.get(r.productId)?.accepted ?? 0;
    rows.push({
      productId: r.productId,
      requested: r.requested,
      approved,
      received,
      varianceVsApproved: r3(received - approved),
      varianceVsRequested: r3(received - r.requested),
    });
  }
  for (const rc of rec) {
    if (seen.has(rc.productId)) continue; // added at load time, never requested
    rows.push({
      productId: rc.productId,
      requested: 0,
      approved: 0,
      received: rc.accepted,
      varianceVsApproved: r3(rc.accepted),
      varianceVsRequested: r3(rc.accepted),
    });
  }
  return rows;
}

export interface ServiceLevel {
  requestedTotal: number;
  approvedTotal: number;
  receivedTotal: number;
  /** approved / requested — how much of the ask the supervisor approved (0..1). */
  approvedFillRate: number;
  /** received / requested — end-to-end fill rate (0..1). */
  receivedFillRate: number;
  /** received / approved — warehouse → van delivery accuracy (0..1). */
  deliveryAccuracy: number;
  /** Lines whose received ≠ approved. */
  varianceLines: number;
  /** Net received − approved across all lines (signed). */
  netVariance: number;
}

/** Roll fulfillment rows up to the service-level KPIs. Pure. */
export function serviceLevel(rows: readonly FulfillmentRow[]): ServiceLevel {
  const requestedTotal = r3(rows.reduce((s, r) => s + r.requested, 0));
  const approvedTotal = r3(rows.reduce((s, r) => s + r.approved, 0));
  const receivedTotal = r3(rows.reduce((s, r) => s + r.received, 0));
  return {
    requestedTotal,
    approvedTotal,
    receivedTotal,
    approvedFillRate: pct(approvedTotal, requestedTotal),
    receivedFillRate: pct(receivedTotal, requestedTotal),
    deliveryAccuracy: pct(receivedTotal, approvedTotal),
    varianceLines: rows.filter((r) => r.varianceVsApproved !== 0).length,
    netVariance: r3(rows.reduce((s, r) => s + r.varianceVsApproved, 0)),
  };
}
