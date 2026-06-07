// ============================================================================
// Finance Foundation — inventory GL orchestrator (Phase 1, Augment model D-003).
// Bridges a VALUED stock movement (from the inventory costing service) to the
// posting engine, posting ONLY the legs the legacy triggers omit, under distinct
// reference types so there is zero double-post:
//   * receipt → 'goods.received' → Dr Inventory / Cr GR-IR   (reference_type 'goods_receipt')
//   * issue   → 'invoice.cogs'   → Dr COGS / Cr Inventory     (reference_type 'invoice_cogs')
// Pure orchestration over the existing PostingGateway + poster (reuse-over-rebuild).
// Inert unless KAKO_FINANCE is on (poster self-gates) and a caller invokes it.
// ============================================================================

import { postFromEvent, type PostResult } from './poster';
import type { PostingGateway } from './gateway';

export interface CostedMovementGlInput {
  /** 'receipt' (stock in → inventory at cost) or 'issue' (stock out → COGS). */
  kind: 'receipt' | 'issue';
  /** The valued cost of the movement (costing service total_cost). */
  amount: number;
  companyId: string;
  branchId: string;
  /** Source-document id the GL entry references (e.g. the goods-receipt / invoice id). */
  referenceId: string;
  /** ISO entry date. */
  entryDate: string;
  description?: string;
}

const SPEC = {
  receipt: { sourceEvent: 'goods.received', referenceType: 'goods_receipt', amountKey: 'inventory' },
  issue:   { sourceEvent: 'invoice.cogs',   referenceType: 'invoice_cogs',  amountKey: 'cogs' },
} as const;

/** Post the inventory/COGS Augment leg for one valued stock movement. Safe to call
 *  unconditionally — no-op when KAKO_FINANCE is off; skips a zero/negative amount. */
export async function postCostedMovementGl(gw: PostingGateway, input: CostedMovementGlInput): Promise<PostResult> {
  if (!(input.amount > 0)) return { posted: false, reason: 'empty' };
  const spec = SPEC[input.kind];
  return postFromEvent(gw, {
    sourceEvent: spec.sourceEvent,
    referenceType: spec.referenceType,
    referenceId: input.referenceId,
    companyId: input.companyId,
    branchId: input.branchId,
    entryDate: input.entryDate,
    description: input.description,
    context: {
      amounts: { [spec.amountKey]: input.amount },
      costCenters: { branch: input.branchId },
    },
  });
}
