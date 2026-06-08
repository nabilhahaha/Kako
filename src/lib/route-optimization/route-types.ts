// ============================================================================
// Route Optimization — specialized route prioritizers (Phase 3 FMCG). Pure
// scoring for the distinct route purposes: collection, van sales, merchandising,
// and supervisor route riding. Each returns customers/salesmen ranked by a domain
// priority score (highest first). Weights are parameters (no hardcoded rules).
// ============================================================================

const norm = (n: number, max: number): number => (max > 0 ? Math.min(1, Math.max(0, n / max)) : 0);

// ── Collection route: overdue, high balance, promise-to-pay ────────────────
export interface CollectionTarget { customerId: string; overdueAmount: number; balance: number; promiseToPay?: boolean }
export function prioritizeCollectionRoute(targets: readonly CollectionTarget[]): { customerId: string; score: number }[] {
  const maxOverdue = Math.max(1, ...targets.map((t) => t.overdueAmount));
  const maxBalance = Math.max(1, ...targets.map((t) => t.balance));
  return targets
    .map((t) => ({ customerId: t.customerId, score: Math.round((0.5 * norm(t.overdueAmount, maxOverdue) + 0.3 * norm(t.balance, maxBalance) + (t.promiseToPay ? 0.2 : 0)) * 100) }))
    .sort((a, b) => b.score - a.score);
}

// ── Van sales route: expected demand, revenue potential, capacity fit ──────
export interface VanTarget { customerId: string; expectedDemandUnits: number; revenuePotential: number }
export function prioritizeVanRoute(targets: readonly VanTarget[], vehicleCapacityUnits: number): { customerId: string; score: number; cumulativeDemand: number; withinCapacity: boolean }[] {
  const maxRev = Math.max(1, ...targets.map((t) => t.revenuePotential));
  let cum = 0;
  return targets
    .map((t) => ({ customerId: t.customerId, _rev: t.revenuePotential, demand: t.expectedDemandUnits }))
    .sort((a, b) => b._rev - a._rev)
    .map((t) => {
      cum += t.demand;
      return { customerId: t.customerId, score: Math.round(norm(t._rev, maxRev) * 100), cumulativeDemand: cum, withinCapacity: vehicleCapacityUnits <= 0 || cum <= vehicleCapacityUnits };
    });
}

// ── Merchandising route: OOS risk, MSL gap, low Perfect Store, promo/visibility ─
export interface MerchTarget { customerId: string; oosRisk: number; mslGapPct: number; perfectStoreScore: number; promoActive?: boolean }
export function prioritizeMerchRoute(targets: readonly MerchTarget[]): { customerId: string; score: number }[] {
  return targets
    .map((t) => ({ customerId: t.customerId, score: Math.round((0.35 * norm(t.oosRisk, 100) + 0.3 * norm(t.mslGapPct, 100) + 0.25 * norm(100 - t.perfectStoreScore, 100) + (t.promoActive ? 0.1 : 0)) * 100) }))
    .sort((a, b) => b.score - a.score);
}

// ── Supervisor route riding: low performers, new joiners, low compliance ───
export interface RidingTarget { salesmanId: string; performanceScore: number; newJoiner?: boolean; routeCompliancePct: number; opportunityScore?: number }
export function prioritizeRidingRoute(targets: readonly RidingTarget[]): { salesmanId: string; score: number }[] {
  return targets
    .map((t) => ({ salesmanId: t.salesmanId, score: Math.round((0.35 * norm(100 - t.performanceScore, 100) + (t.newJoiner ? 0.25 : 0) + 0.25 * norm(100 - t.routeCompliancePct, 100) + 0.15 * norm(t.opportunityScore ?? 0, 100)) * 100) }))
    .sort((a, b) => b.score - a.score);
}
