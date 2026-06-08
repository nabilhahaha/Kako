// ============================================================================
// Route Optimization — dashboard read-models (Phase 3 FMCG). Pure rollups for the
// salesman / supervisor / management route dashboards. No I/O — thin pages/actions
// wrap these.
// ============================================================================

export interface RoutePerf {
  routeId: string;
  salesmanId?: string;
  plannedCalls: number;
  actualCalls: number;
  productiveCalls: number;
  travelTimeMin: number;
  totalDistanceM: number;
  revenue?: number;
  territoryId?: string | null;
}

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 100) : 0);

/** Salesman route dashboard: efficiency, travel, coverage, calls, compliance. Pure. */
export function salesmanRouteDashboard(routes: readonly RoutePerf[], salesmanId: string) {
  const mine = routes.filter((r) => r.salesmanId === salesmanId);
  const planned = mine.reduce((s, r) => s + r.plannedCalls, 0);
  const actual = mine.reduce((s, r) => s + r.actualCalls, 0);
  const productive = mine.reduce((s, r) => s + r.productiveCalls, 0);
  const travel = mine.reduce((s, r) => s + r.travelTimeMin, 0);
  return {
    routes: mine.length,
    coveragePct: pct(actual, planned),
    compliancePct: pct(actual, planned),
    strikeRatePct: pct(productive, actual),
    calls: actual,
    travelTimeMin: travel,
    routeEfficiency: travel > 0 ? Math.round((productive / travel) * 100) / 100 : 0, // productive calls per travel-minute
  };
}

/** Supervisor route dashboard: team compliance, utilization, coverage gaps. Pure. */
export function supervisorRouteDashboard(routes: readonly RoutePerf[]) {
  const planned = routes.reduce((s, r) => s + r.plannedCalls, 0);
  const actual = routes.reduce((s, r) => s + r.actualCalls, 0);
  return {
    routeCount: routes.length,
    teamCompliancePct: pct(actual, planned),
    utilizationPct: pct(actual, planned),
    coverageGaps: routes.filter((r) => r.actualCalls < r.plannedCalls).map((r) => ({ routeId: r.routeId, missed: r.plannedCalls - r.actualCalls })),
  };
}

/** Management route dashboard: territory + route performance, opportunities, revenue. Pure. */
export function managementRouteDashboard(routes: readonly RoutePerf[]) {
  const byTerritory = new Map<string, { revenue: number; planned: number; actual: number }>();
  for (const r of routes) {
    const k = r.territoryId ?? 'unassigned';
    const g = byTerritory.get(k) ?? { revenue: 0, planned: 0, actual: 0 };
    g.revenue += r.revenue ?? 0; g.planned += r.plannedCalls; g.actual += r.actualCalls;
    byTerritory.set(k, g);
  }
  return {
    revenueByRoute: routes.map((r) => ({ routeId: r.routeId, revenue: r.revenue ?? 0 })).sort((a, b) => b.revenue - a.revenue),
    territoryPerformance: [...byTerritory.entries()].map(([territoryId, g]) => ({ territoryId, revenue: g.revenue, compliancePct: pct(g.actual, g.planned) })),
    routePerformance: routes.map((r) => ({ routeId: r.routeId, compliancePct: pct(r.actualCalls, r.plannedCalls), strikeRatePct: pct(r.productiveCalls, r.actualCalls) })),
    optimizationOpportunities: routes.filter((r) => r.totalDistanceM > 0 && r.actualCalls > 0)
      .map((r) => ({ routeId: r.routeId, metersPerCall: Math.round(r.totalDistanceM / r.actualCalls) }))
      .sort((a, b) => b.metersPerCall - a.metersPerCall).slice(0, 10),
  };
}
