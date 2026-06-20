/**
 * Territory Intelligence Studio — shared scope model (STUDIO-UX hardening). Pure,
 * no I/O. A scope is a progressive Region → Salesman → Route drill-down over a
 * customer set; it is lifted to Studio state so EVERY stage (Overview · Audit ·
 * Map · Optimize · Plan) and the persistent map all render the same working set.
 * Operates on already-scenario-applied customers, so salesman/route filters reflect
 * in-session edits.
 */
import type { TisCustomer } from './dataset';

/** Above this route count, auto-scope to a region instead of loading all routes. */
export const SCOPE_THRESHOLD = 12;

export interface ScopeState {
  region: string;     // '' = all regions
  salesman: string;   // '' = all salesmen
  routes: string[];   // [] = all routes (within region/salesman)
}

export const emptyScope = (): ScopeState => ({ region: '', salesman: '', routes: [] });
export const isScoped = (s: ScopeState): boolean => s.region !== '' || s.salesman !== '' || s.routes.length > 0;

/** Selecting a region resets the downstream salesman + route picks. */
export const withRegion = (region: string): ScopeState => ({ region, salesman: '', routes: [] });
/** Selecting a salesman resets the downstream route picks. */
export const withSalesman = (s: ScopeState, salesman: string): ScopeState => ({ ...s, salesman, routes: [] });
export const toggleRoute = (s: ScopeState, routeId: string): ScopeState => ({
  ...s,
  routes: s.routes.includes(routeId) ? s.routes.filter((r) => r !== routeId) : [...s.routes, routeId],
});

/** Does a customer fall within the scope? */
export function scopeMatches(c: TisCustomer, s: ScopeState): boolean {
  if (s.region && c.ownership.regionId !== s.region) return false;
  if (s.salesman && (c.ownership.salesmanId ?? '') !== s.salesman) return false;
  if (s.routes.length > 0 && !(c.ownership.routeId != null && s.routes.includes(c.ownership.routeId))) return false;
  return true;
}

export const scopeCustomers = (customers: readonly TisCustomer[], s: ScopeState): TisCustomer[] => customers.filter((c) => scopeMatches(c, s));
export const scopeCustomerIds = (customers: readonly TisCustomer[], s: ScopeState): Set<string> => new Set(scopeCustomers(customers, s).map((c) => c.id));

export interface ScopeOption { key: string; count: number }

/** Count distinct values of a key, sorted desc by count. '' (null) kept as a bucket. */
export function countBy(customers: readonly TisCustomer[], keyOf: (c: TisCustomer) => string | null | undefined): ScopeOption[] {
  const m = new Map<string, number>();
  for (const c of customers) { const k = keyOf(c) ?? ''; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export interface ScopeOptions {
  regions: ScopeOption[];
  salesmen: ScopeOption[];
  routes: ScopeOption[];
  /** Customers in the fully-applied scope (the working set). */
  working: TisCustomer[];
  /** Distinct routes across ALL customers (for the "R of TOTAL" summary). */
  totalRoutes: number;
}

/** Progressive option lists for the scope bar: each level narrows the next. */
export function scopeOptions(customers: readonly TisCustomer[], s: ScopeState): ScopeOptions {
  const regions = countBy(customers, (c) => c.ownership.regionId);
  const afterRegion = customers.filter((c) => !s.region || c.ownership.regionId === s.region);
  const salesmen = countBy(afterRegion, (c) => c.ownership.salesmanId);
  const afterSalesman = afterRegion.filter((c) => !s.salesman || (c.ownership.salesmanId ?? '') === s.salesman);
  const routes = countBy(afterSalesman, (c) => c.ownership.routeId);
  const working = afterSalesman.filter((c) => s.routes.length === 0 || (c.ownership.routeId != null && s.routes.includes(c.ownership.routeId)));
  const totalRoutes = new Set(customers.map((c) => c.ownership.routeId).filter(Boolean)).size;
  return { regions, salesmen, routes, working, totalRoutes };
}

/** Smart default scope at scale: focus the largest *meaningful* region (≥2 routes)
 *  so a manager never loads every route at once; small/degenerate tenants stay 'all'. */
export function initialScopeRegion(customers: readonly TisCustomer[], defaultRegionId?: string): string {
  const allRoutes = new Set(customers.map((c) => c.ownership.routeId).filter(Boolean)).size;
  if (allRoutes <= SCOPE_THRESHOLD) return '';
  if (defaultRegionId && customers.some((c) => c.ownership.regionId === defaultRegionId)) return defaultRegionId;
  const routesByRegion = new Map<string, Set<string>>();
  for (const c of customers) {
    if (!c.ownership.regionId || !c.ownership.routeId) continue;
    (routesByRegion.get(c.ownership.regionId) ?? routesByRegion.set(c.ownership.regionId, new Set()).get(c.ownership.regionId)!).add(c.ownership.routeId);
  }
  let best = '', bestN = 0;
  for (const [region, routes] of routesByRegion) if (routes.size > bestN) { bestN = routes.size; best = region; }
  return bestN >= 2 ? best : '';
}

export const initialScope = (customers: readonly TisCustomer[], defaultRegionId?: string): ScopeState => ({
  region: initialScopeRegion(customers, defaultRegionId), salesman: '', routes: [],
});
