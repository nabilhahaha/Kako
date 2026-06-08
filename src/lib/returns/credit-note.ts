// ============================================================================
// Returns — credit-note builder (Phase 4+). Pure. Turns a reconciled return into
// a credit-note payload with promotion / incentive / commission adjustments,
// linked to the original invoice + return. The persistence + numbering wrap this.
// ============================================================================

import type { ReturnReconciliation } from './reconciliation';

export interface CreditNoteDraft {
  returnId: string;
  invoiceId: string | null;
  amount: number;                  // net return value (credit owed to customer)
  promotionAdjustment: number;     // funding/discount reversed
  incentiveAdjustment: number;
  commissionAdjustment: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build a credit-note draft from a reconciled return. Pure. */
export function buildCreditNote(returnId: string, invoiceId: string | null, recon: ReturnReconciliation): CreditNoteDraft {
  return {
    returnId,
    invoiceId,
    amount: recon.totals.netReturnValue,
    promotionAdjustment: round2(recon.totals.discountReversed + recon.totals.fundingReversed),
    incentiveAdjustment: recon.totals.incentiveReversed,
    commissionAdjustment: recon.totals.commissionReversed,
  };
}
