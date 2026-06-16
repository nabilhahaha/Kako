// Stock request approval — PURE helpers mirroring the erp_approve_stock_request
// contract (partial approval): the loaded quantity per line is the APPROVED
// quantity, falling back to the REQUESTED quantity when no adjustment was made,
// and a line reduced to 0 is NOT loaded. Kept pure so the contract is unit-tested
// and the approver UI (Requested · Approved · Difference) and the RPC agree.

export interface ApprovalLine {
  productId: string;
  requestedQty: number;
  /** null = not adjusted → load the requested qty. */
  approvedQty: number | null;
}

/** The quantity that actually loads for a line. Pure. */
export function effectiveApprovedQty(approvedQty: number | null | undefined, requestedQty: number): number {
  return approvedQty == null ? Number(requestedQty || 0) : Number(approvedQty || 0);
}

/** Approved − Requested (negative = reduced, positive = increased). Pure. */
export function lineDifference(approvedQty: number | null | undefined, requestedQty: number): number {
  return effectiveApprovedQty(approvedQty, requestedQty) - Number(requestedQty || 0);
}

/** The lines that actually load on approval (effective qty > 0). Pure. */
export function loadableLines(lines: ApprovalLine[]): { productId: string; qty: number }[] {
  return (lines ?? [])
    .map((l) => ({ productId: l.productId, qty: effectiveApprovedQty(l.approvedQty, l.requestedQty) }))
    .filter((l) => l.qty > 0);
}

/** True when any line's approved qty differs from requested (a partial approval). Pure. */
export function isPartialApproval(lines: ApprovalLine[]): boolean {
  return (lines ?? []).some((l) => effectiveApprovedQty(l.approvedQty, l.requestedQty) !== Number(l.requestedQty || 0));
}
