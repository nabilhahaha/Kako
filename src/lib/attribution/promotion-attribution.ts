// ============================================================================
// Commercial Attribution — promotion attribution (Phase 4+). Pure. Per-promotion
// commercial rollup (gross/net sales, qty, free, discount, cost + funding shares,
// incremental sales/GP, ROI, payback) — REUSES the trade-spend ROI engine.
// ============================================================================

import { computeRoi, type RoiResult } from '@/lib/trade-spend/roi';

export interface PromotionAttributionInput {
  promotionId: string;
  grossSales: number;
  netSales: number;
  qtySold: number;
  freeQty: number;
  discountValue: number;
  baselineSales: number;
  marginPct: number;
  supplierShare: number;
  companyShare: number;
  distributorShare: number;
}

export interface PromotionAttributionResult {
  promotionId: string;
  grossSales: number;
  netSales: number;
  qtySold: number;
  freeQty: number;
  discountValue: number;
  promotionCost: number;
  supplierShare: number;
  companyShare: number;
  distributorShare: number;
  roi: RoiResult;
  paybackRatio: number | null;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Attribute a promotion's full commercial result. Pure. */
export function attributePromotion(input: PromotionAttributionInput): PromotionAttributionResult {
  const promotionCost = round2(input.supplierShare + input.companyShare + input.distributorShare + input.discountValue);
  const roi = computeRoi({ baselineSales: input.baselineSales, actualSales: input.netSales, marginPct: input.marginPct, spend: promotionCost });
  return {
    promotionId: input.promotionId,
    grossSales: round2(input.grossSales),
    netSales: round2(input.netSales),
    qtySold: input.qtySold,
    freeQty: input.freeQty,
    discountValue: round2(input.discountValue),
    promotionCost,
    supplierShare: round2(input.supplierShare),
    companyShare: round2(input.companyShare),
    distributorShare: round2(input.distributorShare),
    roi,
    paybackRatio: roi.incrementalMargin > 0 ? round2(promotionCost / roi.incrementalMargin) : null,
  };
}
