// ============================================================================
// Returns — commercial reconciliation engine (Phase 4+). Pure. A return is NOT a
// quantity reversal: it must reverse the commercial reality of the original sale
// proportionally — free goods, discounts, trade-spend funding, incentives, and
// commissions. REUSES the promotion reversal engines (free-goods/funding/
// incentives/commission) so reversal logic is single-sourced. No I/O.
// ============================================================================

import { freeGoodsReversal } from '@/lib/promotion/free-goods';
import { reverseFunding, type FundingAllocation } from '@/lib/promotion/funding';
import { reverseIncentives, type IncentivePayout } from '@/lib/promotion/incentives';
import { commissionAdjustment, type CommissionRule } from '@/lib/promotion/commission';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** The original sale facts a return line reverses against. */
export interface OriginalLine {
  invoiceLineId: string;
  productId: string;
  soldQty: number;
  freeQtySold: number;
  unitPrice: number;
  discountAmount: number;                 // total discount applied on the original line
  promotionId?: string | null;
  fundingAllocations?: FundingAllocation[];
  incentivePayouts?: IncentivePayout[];
  commissionRule?: CommissionRule;
  commissionBase?: number;                // original commissionable base (e.g. net line value)
  commissionAchievementPct?: number;
}

export interface ReturnLineReconciliation {
  invoiceLineId: string;
  productId: string;
  returnedQty: number;
  reversalRatio: number;                  // returnedQty / soldQty (0..1)
  freeQtyReturned: number;
  discountReversed: number;
  grossReturnValue: number;               // returnedQty × unitPrice
  netReturnValue: number;                 // gross − discountReversed
  fundingReversed: FundingAllocation[];
  incentiveAdjustments: { role: string; reversal: number }[];
  commissionReversal: number;
}

/** Reconcile one return line against its original sale line. Pure. */
export function reconcileReturnLine(orig: OriginalLine, returnedQty: number): ReturnLineReconciliation {
  const ratio = orig.soldQty > 0 ? Math.max(0, Math.min(1, returnedQty / orig.soldQty)) : 0;
  const grossReturnValue = round2(returnedQty * orig.unitPrice);
  const discountReversed = round2(orig.discountAmount * ratio);
  const commissionReversal = orig.commissionRule && orig.commissionBase != null
    ? commissionAdjustment(orig.commissionRule, orig.commissionBase, round2(orig.commissionBase * (1 - ratio)), orig.commissionAchievementPct ?? 100).reversal
    : 0;
  return {
    invoiceLineId: orig.invoiceLineId,
    productId: orig.productId,
    returnedQty,
    reversalRatio: round2(ratio),
    freeQtyReturned: freeGoodsReversal(orig.soldQty, orig.freeQtySold, returnedQty),
    discountReversed,
    grossReturnValue,
    netReturnValue: round2(grossReturnValue - discountReversed),
    fundingReversed: orig.fundingAllocations ? reverseFunding(orig.fundingAllocations, ratio) : [],
    incentiveAdjustments: orig.incentivePayouts ? reverseIncentives(orig.incentivePayouts, ratio) : [],
    commissionReversal,
  };
}

export interface ReturnReconciliation {
  lines: ReturnLineReconciliation[];
  totals: {
    grossReturnValue: number;
    netReturnValue: number;
    discountReversed: number;
    freeQtyReturned: number;
    fundingReversed: number;
    incentiveReversed: number;
    commissionReversed: number;
  };
}

/** Reconcile a whole return (many lines). Pure. */
export function reconcileReturn(items: readonly { original: OriginalLine; returnedQty: number }[]): ReturnReconciliation {
  const lines = items.map((it) => reconcileReturnLine(it.original, it.returnedQty));
  return {
    lines,
    totals: {
      grossReturnValue: round2(lines.reduce((s, l) => s + l.grossReturnValue, 0)),
      netReturnValue: round2(lines.reduce((s, l) => s + l.netReturnValue, 0)),
      discountReversed: round2(lines.reduce((s, l) => s + l.discountReversed, 0)),
      freeQtyReturned: lines.reduce((s, l) => s + l.freeQtyReturned, 0),
      fundingReversed: round2(lines.reduce((s, l) => s + l.fundingReversed.reduce((a, f) => a + f.amount, 0), 0)),
      incentiveReversed: round2(lines.reduce((s, l) => s + l.incentiveAdjustments.reduce((a, i) => a + i.reversal, 0), 0)),
      commissionReversed: round2(lines.reduce((s, l) => s + l.commissionReversal, 0)),
    },
  };
}
