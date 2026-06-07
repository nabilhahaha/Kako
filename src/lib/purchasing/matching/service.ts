// ============================================================================
// Purchasing — matching service (Phase 2). Pure orchestration over the match
// gateway + the pure 3-way match engine: for each bill line, compare PO / GRN /
// invoice, persist the per-line match status + flags, aggregate to the invoice,
// and set the invoice to 'matched' (clean) or 'on_hold' (any blocking variance).
// No-op unless KAKO_PURCHASING is on. AP control: an invoice with a blocking
// variance is held, never auto-approved for payment.
// ============================================================================

import { PURCHASING_ENABLED } from '../flags';
import { matchLine, type MatchTolerance } from './three-way-match';
import type { MatchGateway, LineMatchStatus } from './gateway';

export interface MatchInvoiceResult {
  applied: boolean;
  reason?: 'disabled' | 'no_lines';
  matchStatus?: LineMatchStatus;
  invoiceStatus?: 'matched' | 'on_hold';
  lines?: Array<{ id: string; status: LineMatchStatus; flags: string[] }>;
}

/** Match every line of a supplier invoice and set its hold/match status. */
export async function matchInvoice(
  gw: MatchGateway,
  invoiceId: string,
  tolerance: MatchTolerance = {},
): Promise<MatchInvoiceResult> {
  if (!PURCHASING_ENABLED()) return { applied: false, reason: 'disabled' };

  const lines = await gw.loadInvoiceLines(invoiceId);
  if (lines.length === 0) return { applied: false, reason: 'no_lines' };

  const results: Array<{ id: string; status: LineMatchStatus; flags: string[] }> = [];

  for (const line of lines) {
    const poRef = line.poLineId ? await gw.loadPoLine(line.poLineId) : null;
    const receivedQty = await gw.loadReceivedQty(line.poLineId, line.grLineId);

    // Without a PO link, ordered/price default to the invoice values so the
    // received-vs-billed (over-billing) check still applies — we never silently
    // pass an over-billed line just because the PO link is missing.
    const r = matchLine(
      {
        orderedQty: poRef?.orderedQty ?? line.invoicedQty,
        poUnitPrice: poRef?.unitPrice ?? line.invoiceUnitPrice,
        receivedQty,
        invoicedQty: line.invoicedQty,
        invoiceUnitPrice: line.invoiceUnitPrice,
      },
      tolerance,
    );

    const status: LineMatchStatus = r.matched ? 'matched' : 'variance';
    await gw.saveLineMatch(line.id, status, r.flags);
    results.push({ id: line.id, status, flags: r.flags });
  }

  const allMatched = results.every((r) => r.status === 'matched');
  const matchStatus: LineMatchStatus = allMatched ? 'matched' : 'variance';
  const invoiceStatus = allMatched ? 'matched' : 'on_hold';
  await gw.saveInvoiceMatch(invoiceId, matchStatus, invoiceStatus);

  return { applied: true, matchStatus, invoiceStatus, lines: results };
}
