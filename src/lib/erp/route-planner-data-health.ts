/**
 * Route Planner — Data Health checks (Integration Foundation). Pure, cross-dataset
 * quality checks run on each sync over the optional business datasets. No I/O — the
 * caller feeds already-parsed rows (from the import mapping); results are written into
 * erp_rp_sync_runs.quality. Every dataset is optional; a check is skipped (count 0)
 * when its inputs aren't present.
 */
import type { RpQualityCheck } from './route-planner-backend';

const norm = (v: unknown): string => (v ?? '').toString().trim().toLowerCase();
const hasGps = (lat?: number | null, lng?: number | null): boolean =>
  lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

export interface HCustomer { code?: string | null; name?: string | null; lat?: number | null; lng?: number | null; salesman?: string | null; route?: string | null }
export interface HKeyed { code?: string | null }                                  // rows keyed by customer code
export interface HSalesRow extends HKeyed { netSales?: number | null }
export interface HReturnRow extends HKeyed { value?: number | null }
export interface HRouteRow { code?: string | null; salesman?: string | null }     // a customer in a route
export interface HTargetRow { salesman?: string | null; region?: string | null }

export interface DataHealthInput {
  customers: HCustomer[];
  sales?: HSalesRow[];
  credit?: HKeyed[];
  returns?: HReturnRow[];
  routes?: HRouteRow[];
  targets?: HTargetRow[];
  /** Known salesmen (from hierarchy / customer master) used to validate assignments. */
  salesmen?: string[];
  /** Known regions (from territory data) used to validate targets. */
  regions?: string[];
}

export interface HealthCheckResult { count: number; sample: string[] }
export type DataHealthReport = Partial<Record<RpQualityCheck, HealthCheckResult>>;

const SAMPLE = 50;
function result(rows: string[]): HealthCheckResult { return { count: rows.length, sample: rows.slice(0, SAMPLE) }; }

/**
 * Run all applicable Data-Health checks. Pure. Each customer is identified by code
 * (fallback name). Cross-dataset checks only run when both datasets are present.
 */
export function runDataHealth(input: DataHealthInput): DataHealthReport {
  const { customers, sales, credit, returns, routes, targets } = input;
  const out: DataHealthReport = {};

  // Customer master keys.
  const masterCodes = new Set(customers.map((c) => norm(c.code)).filter(Boolean));
  const knownSalesmen = new Set((input.salesmen ?? customers.map((c) => c.salesman ?? '')).map(norm).filter(Boolean));
  const knownRegions = new Set((input.regions ?? []).map(norm).filter(Boolean));

  // 1) missing customer code
  out.missing_customer_code = result(customers.filter((c) => !norm(c.code)).map((c) => c.name ?? '(no name)'));

  // 2) duplicate customer (by code, else name+rounded coords)
  {
    const seen = new Set<string>(); const dups: string[] = [];
    for (const c of customers) {
      const key = norm(c.code) || `${norm(c.name)}@${(c.lat ?? 0).toFixed(4)},${(c.lng ?? 0).toFixed(4)}`;
      if (seen.has(key)) dups.push(c.code ?? c.name ?? key); else seen.add(key);
    }
    out.duplicate_customer = result(dups);
  }

  // 3) missing GPS
  out.missing_gps = result(customers.filter((c) => !hasGps(c.lat, c.lng)).map((c) => c.code ?? c.name ?? ''));

  // 4) invalid salesman assignment (customer has a salesman not in the known set)
  if (knownSalesmen.size > 0) {
    out.invalid_salesman = result(customers.filter((c) => norm(c.salesman) && !knownSalesmen.has(norm(c.salesman))).map((c) => `${c.code ?? c.name}: ${c.salesman}`));
  }

  // 5) customer not assigned to a route (route column empty)
  if (routes || customers.some((c) => c.route != null)) {
    const routedCodes = new Set([...customers.filter((c) => norm(c.route)).map((c) => norm(c.code)), ...(routes ?? []).map((r) => norm(r.code))].filter(Boolean));
    out.customer_no_route = result(customers.filter((c) => norm(c.code) && !routedCodes.has(norm(c.code))).map((c) => c.code ?? c.name ?? ''));

    // 6) customer with sales but no route
    if (sales) {
      const salesCodes = new Set(sales.map((s) => norm(s.code)).filter((k) => k));
      out.sales_no_route = result([...salesCodes].filter((code) => !routedCodes.has(code)));
    }
  }

  // 7) route customer not found in master
  if (routes) {
    out.route_customer_missing = result(routes.filter((r) => norm(r.code) && !masterCodes.has(norm(r.code))).map((r) => r.code ?? ''));
  }
  // 8) credit data without a matching customer
  if (credit) {
    out.credit_no_customer = result(credit.filter((r) => norm(r.code) && !masterCodes.has(norm(r.code))).map((r) => r.code ?? ''));
  }
  // 9) return without a matching customer
  if (returns) {
    out.return_no_customer = result(returns.filter((r) => norm(r.code) && !masterCodes.has(norm(r.code))).map((r) => r.code ?? ''));
    // 10) return without sales (or implausible return with no sales row)
    if (sales) {
      const salesByCode = new Map<string, number>();
      for (const s of sales) { const k = norm(s.code); if (k) salesByCode.set(k, (salesByCode.get(k) ?? 0) + (s.netSales ?? 0)); }
      out.return_no_sales = result(returns.filter((r) => norm(r.code) && (r.value ?? 0) > 0 && (salesByCode.get(norm(r.code)) ?? 0) <= 0).map((r) => r.code ?? ''));
    }
  }
  // 11) target without a matching salesman/region
  if (targets) {
    out.target_no_owner = result(targets.filter((tg) => {
      const sm = norm(tg.salesman), rg = norm(tg.region);
      if (sm) return knownSalesmen.size > 0 && !knownSalesmen.has(sm);
      if (rg) return knownRegions.size > 0 && !knownRegions.has(rg);
      return true; // a target with neither owner is invalid
    }).map((tg) => tg.salesman ?? tg.region ?? '(no owner)'));
  }

  return out;
}

/** Total number of flagged rows across all checks (for a quick "issues" badge). */
export function dataHealthTotal(report: DataHealthReport): number {
  return Object.values(report).reduce((n, r) => n + (r?.count ?? 0), 0);
}
