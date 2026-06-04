/** ── Retail Execution — Distribution KPI engine (pure, no I/O) ─────────────
 *
 *  Numeric and weighted distribution are the core FMCG penetration metrics:
 *    • Numeric distribution  = outlets selling a product / total outlets in scope.
 *    • Weighted distribution = Σ weight(selling outlets) / Σ weight(all outlets),
 *      where weight is the outlet's commercial importance (e.g. period turnover or
 *      a class A/B/C value), so a big account counts more than a kiosk.
 *
 *  These match the distribution analytics in Pepperi/Repsly/StayinFront/BeatRoute/
 *  Salesforce Consumer Goods Cloud. Pure + testable; the server supplies the
 *  RLS-scoped outlet universe (who sold what, and each outlet's weight).
 */

export interface OutletForKpi {
  customerId: string;
  /** Commercial weight (period turnover, or 1 for unweighted/equal). */
  weight: number;
  /** Product ids this outlet has stocked/sold in the window. */
  soldProductIds: ReadonlySet<string>;
}

export interface ProductDistribution {
  productId: string;
  outletsSelling: number;
  totalOutlets: number;
  /** outletsSelling / totalOutlets, 0..100. */
  numericPct: number;
  /** weighted selling / weighted total, 0..100. */
  weightedPct: number;
}

/** Numeric + weighted distribution of one product across an outlet universe. */
export function productDistribution(
  productId: string,
  outlets: readonly OutletForKpi[],
): ProductDistribution {
  let outletsSelling = 0, weightSelling = 0, weightTotal = 0;
  for (const o of outlets) {
    const w = Math.max(0, o.weight);
    weightTotal += w;
    if (o.soldProductIds.has(productId)) {
      outletsSelling++;
      weightSelling += w;
    }
  }
  const totalOutlets = outlets.length;
  const numericPct = totalOutlets === 0 ? 0 : Math.round((outletsSelling / totalOutlets) * 100);
  const weightedPct = weightTotal === 0 ? 0 : Math.round((weightSelling / weightTotal) * 100);
  return { productId, outletsSelling, totalOutlets, numericPct, weightedPct };
}

/** Distribution for many products, weakest numeric first (where to push). */
export function distributionForProducts(
  productIds: readonly string[],
  outlets: readonly OutletForKpi[],
): ProductDistribution[] {
  return productIds
    .map((id) => productDistribution(id, outlets))
    .sort((a, b) => a.numericPct - b.numericPct || a.weightedPct - b.weightedPct);
}

export interface DistributionSummary {
  products: number;
  avgNumericPct: number;
  avgWeightedPct: number;
}

/** Portfolio averages across the measured products. */
export function summarizeDistribution(rows: readonly ProductDistribution[]): DistributionSummary {
  const products = rows.length;
  if (products === 0) return { products: 0, avgNumericPct: 0, avgWeightedPct: 0 };
  const sumN = rows.reduce((s, r) => s + r.numericPct, 0);
  const sumW = rows.reduce((s, r) => s + r.weightedPct, 0);
  return {
    products,
    avgNumericPct: Math.round(sumN / products),
    avgWeightedPct: Math.round(sumW / products),
  };
}

export interface DimensionRow { key: string; label: string; outlets: readonly OutletForKpi[] }
export interface DimensionDistribution { key: string; label: string; outlets: number; numericPct: number; weightedPct: number }

/** Average distribution of a product set, grouped by a dimension (channel/segment/
 *  region) — each group's outlets are supplied pre-bucketed by the caller. */
export function distributionByDimension(
  productIds: readonly string[],
  groups: readonly DimensionRow[],
): DimensionDistribution[] {
  return groups.map((g) => {
    const summary = summarizeDistribution(distributionForProducts(productIds, g.outlets));
    return {
      key: g.key,
      label: g.label,
      outlets: g.outlets.length,
      numericPct: summary.avgNumericPct,
      weightedPct: summary.avgWeightedPct,
    };
  });
}
