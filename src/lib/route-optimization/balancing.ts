// ============================================================================
// Route Optimization — route/territory balancing (Phase 3 FMCG). Pure. Flags
// overloaded / underutilized routes (and territory imbalance) against the mean,
// by any chosen metric (customer count, sales value, call count, revenue
// potential, collection volume, travel time). No I/O.
// ============================================================================

export interface RouteMetrics {
  routeId: string;
  customerCount?: number;
  salesValue?: number;
  callCount?: number;
  revenuePotential?: number;
  collectionVolume?: number;
  travelTimeMin?: number;
}

export type BalanceMetric =
  | 'customer_count' | 'sales_value' | 'call_count' | 'revenue_potential' | 'collection_volume' | 'travel_time';

const FIELD: Record<BalanceMetric, keyof RouteMetrics> = {
  customer_count: 'customerCount', sales_value: 'salesValue', call_count: 'callCount',
  revenue_potential: 'revenuePotential', collection_volume: 'collectionVolume', travel_time: 'travelTimeMin',
};

export type BalanceStatus = 'overloaded' | 'underutilized' | 'balanced';

export interface BalanceRow {
  routeId: string;
  value: number;
  deviationPct: number;   // vs mean, signed
  status: BalanceStatus;
}

export interface BalanceResult {
  metric: BalanceMetric;
  mean: number;
  rows: BalanceRow[];
  overloaded: string[];
  underutilized: string[];
}

/** Classify routes vs the mean for a metric; |deviation| > thresholdPct flags. Pure. */
export function analyzeBalance(
  routes: readonly RouteMetrics[],
  metric: BalanceMetric,
  thresholdPct = 20,
): BalanceResult {
  const f = FIELD[metric];
  const values = routes.map((r) => Number(r[f] ?? 0));
  const mean = values.length ? values.reduce((s, n) => s + n, 0) / values.length : 0;
  const rows: BalanceRow[] = routes.map((r) => {
    const value = Number(r[f] ?? 0);
    const deviationPct = mean > 0 ? Math.round(((value - mean) / mean) * 100) : 0;
    const status: BalanceStatus = deviationPct > thresholdPct ? 'overloaded' : deviationPct < -thresholdPct ? 'underutilized' : 'balanced';
    return { routeId: r.routeId, value, deviationPct, status };
  });
  return {
    metric, mean: Math.round(mean), rows,
    overloaded: rows.filter((r) => r.status === 'overloaded').map((r) => r.routeId),
    underutilized: rows.filter((r) => r.status === 'underutilized').map((r) => r.routeId),
  };
}
