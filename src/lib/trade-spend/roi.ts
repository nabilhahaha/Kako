// ============================================================================
// Trade Spend — ROI foundation (Phase 4). Pure, no DB. Measures whether a
// promotion paid back: incremental sales over a baseline run-rate, the margin on
// that uplift, and the return vs the trade spend.
//   incrementalSales  = actualSales − baselineSales        (signed)
//   incrementalMargin = incrementalSales × marginPct%
//   netRoi            = incrementalMargin − spend          (profit after spend)
//   roiRatio          = incrementalMargin / spend          (null when spend = 0)
// "positive" = the promotion generated more margin than it cost.
// ============================================================================

export interface RoiInputs {
  baselineSales: number; // expected sales without the promo (run-rate over the period)
  actualSales: number;   // actual sales during the promo
  marginPct: number;     // gross margin % on the uplift
  spend: number;         // trade spend accrued/settled for the promo
}

export interface RoiResult {
  incrementalSales: number;
  incrementalMargin: number;
  spend: number;
  netRoi: number;            // incrementalMargin − spend
  roiRatio: number | null;   // incrementalMargin / spend (null if spend = 0)
  roiPct: number | null;     // roiRatio × 100
  positive: boolean;         // netRoi > 0
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Compute promotion ROI. Pure. Incremental values are signed (a promo can lose). */
export function computeRoi(inp: RoiInputs): RoiResult {
  const incrementalSales = round2(inp.actualSales - inp.baselineSales);
  const incrementalMargin = round2(incrementalSales * Math.max(0, inp.marginPct) / 100);
  const spend = round2(Math.max(0, inp.spend));
  const netRoi = round2(incrementalMargin - spend);
  const roiRatio = spend > 0 ? round2(incrementalMargin / spend) : null;
  return {
    incrementalSales,
    incrementalMargin,
    spend,
    netRoi,
    roiRatio,
    roiPct: roiRatio == null ? null : round2(roiRatio * 100),
    positive: netRoi > 0,
  };
}
