// ============================================================================
// Commercial Excellence — forecasting engine (Phase 7). Pure. Demand planning
// across sales/customer/route/SKU/brand, driven by historical sales + seasonality
// + promotion uplift + distribution growth, with accuracy metrics (MAPE/WAPE/bias/
// variance). No I/O.
// ============================================================================

export type ForecastType = 'sales' | 'customer' | 'route' | 'sku' | 'brand';
export type ForecastDriver = 'historical' | 'seasonality' | 'promotion_uplift' | 'new_listings' | 'distribution_growth' | 'market_expansion';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ForecastDrivers {
  seasonalityIndex?: number;   // multiplier (1 = neutral)
  promotionUpliftPct?: number; // +%
  growthPct?: number;          // distribution/market growth +%
}

/**
 * Base forecast from history (moving average) adjusted by drivers. Pure.
 * forecast = avg(history) × seasonality × (1 + uplift%) × (1 + growth%).
 */
export function forecastFromHistory(history: readonly number[], drivers: ForecastDrivers = {}): number {
  if (history.length === 0) return 0;
  const avg = history.reduce((s, n) => s + n, 0) / history.length;
  const season = drivers.seasonalityIndex ?? 1;
  const uplift = 1 + (drivers.promotionUpliftPct ?? 0) / 100;
  const growth = 1 + (drivers.growthPct ?? 0) / 100;
  return round2(avg * season * uplift * growth);
}

export interface ForecastPoint { actual: number; forecast: number }

export interface ForecastAccuracy {
  mape: number | null;   // mean absolute percentage error %
  wape: number;          // weighted absolute percentage error %
  bias: number;          // mean(forecast − actual)
  variance: number;      // mean squared error
  accuracyPct: number;   // 100 − WAPE (floored at 0)
}

/** Forecast accuracy metrics over actual/forecast pairs. Pure. */
export function forecastAccuracy(points: readonly ForecastPoint[]): ForecastAccuracy {
  if (points.length === 0) return { mape: null, wape: 0, bias: 0, variance: 0, accuracyPct: 0 };
  let absErr = 0, sumActual = 0, mapeSum = 0, mapeN = 0, biasSum = 0, seSum = 0;
  for (const p of points) {
    const err = p.forecast - p.actual;
    absErr += Math.abs(err);
    sumActual += Math.abs(p.actual);
    biasSum += err;
    seSum += err * err;
    if (p.actual !== 0) { mapeSum += Math.abs(err / p.actual); mapeN += 1; }
  }
  const wape = sumActual > 0 ? round2((absErr / sumActual) * 100) : 0;
  return {
    mape: mapeN > 0 ? round2((mapeSum / mapeN) * 100) : null,
    wape,
    bias: round2(biasSum / points.length),
    variance: round2(seSum / points.length),
    accuracyPct: round2(Math.max(0, 100 - wape)),
  };
}
