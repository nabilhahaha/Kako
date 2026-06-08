// ============================================================================
// Suggested Load — demand projection (Phase 7E). Pure. Projects per-SKU route
// demand by REUSING the Phase-6B forecasting engine (history × seasonality ×
// promotion uplift × growth), optionally scaled by the active-customer ratio
// (fewer active customers today → lower demand). No I/O.
// ============================================================================

import { forecastFromHistory, type ForecastDrivers } from '@/lib/commercial';

export interface SkuDemandInput {
  productId: string;
  history: number[];               // recent per-period sold quantities
  drivers?: ForecastDrivers;       // seasonality / promotion uplift / growth
  activeCustomerRatio?: number;    // 0..1 — active vs baseline customers on the route
}

const round3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Project demand for one SKU. Pure. */
export function projectSkuDemand(i: SkuDemandInput): number {
  const base = forecastFromHistory(i.history, i.drivers);
  return round3(base * (i.activeCustomerRatio ?? 1));
}

/** Project demand for a route's SKUs. Pure. */
export function projectRouteDemand(skus: readonly SkuDemandInput[]): { productId: string; demand: number }[] {
  return skus.map((s) => ({ productId: s.productId, demand: projectSkuDemand(s) }));
}
