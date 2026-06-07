// ============================================================================
// Purchasing — match gateway (the impure DB boundary for the matching service).
// Keeps the service unit-testable with a fake and the engine pure. The Supabase
// implementation lives in supabase-gateway.ts (0190 tables).
// ============================================================================

export interface InvoiceLineForMatch {
  id: string;
  invoicedQty: number;
  invoiceUnitPrice: number;
  poLineId: string | null;
  grLineId: string | null;
}

/** PO line reference: the ordered quantity and agreed unit price. */
export interface PoLineRef {
  orderedQty: number;
  unitPrice: number;
}

export type LineMatchStatus = 'unmatched' | 'matched' | 'variance';

export interface MatchGateway {
  /** Bill lines to match for an invoice. */
  loadInvoiceLines(invoiceId: string): Promise<InvoiceLineForMatch[]>;
  /** Ordered qty + agreed price for a PO line, or null if unlinked. */
  loadPoLine(poLineId: string): Promise<PoLineRef | null>;
  /** Quantity received against this line (by GR line if given, else by PO line). */
  loadReceivedQty(poLineId: string | null, grLineId: string | null): Promise<number>;
  /** Persist a line's match outcome. */
  saveLineMatch(lineId: string, status: LineMatchStatus, flags: string[]): Promise<void>;
  /** Persist the invoice's aggregate match + workflow status. */
  saveInvoiceMatch(invoiceId: string, matchStatus: LineMatchStatus, invoiceStatus: 'matched' | 'on_hold'): Promise<void>;
}
