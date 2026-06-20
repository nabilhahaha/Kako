/**
 * Territory Audit engine (TA-1). Pure, no I/O. One pass over a TIS-0 dataset that
 * synthesizes manager-ready findings — coverage gaps · territory/route imbalance ·
 * customer distribution · internal white-space — reusing the Coverage rollup
 * (CV-1), FR workload, and the shared balance metric. Capability-aware: sections
 * whose data is absent are omitted (graceful degradation, TIS-0-2). Outputs feed
 * the Simple-Mode surface and, later, Geo / Route Optimization / Sizing.
 */
import { rollupCoverage, type CoverageRollup, type CoverageGroupBy } from '@/lib/distribution/coverage-engine';
import { balancePct } from './balance';
import { resolveCapabilities, type TisCapabilities } from './capabilities';
import { customerWorkload, type TisCustomer, type TisDataset, type TisMode } from './dataset';

export type AuditGroupBy = CoverageGroupBy; // 'salesman' | 'route' | 'region'

/** Per-group balance line: counts + the three weights + a balance score. */
export interface GroupBalance {
  key: string;
  customers: number;
  workload: number;   // Σ visits/week
  salesValue: number;
  /** Coverage % over present statuses in the group (0 when none). */
  coveragePct: number;
}

export interface BalanceSection {
  groupBy: AuditGroupBy;
  groups: GroupBalance[];
  /** Workload balance across groups (100 = even). */
  workloadBalancePct: number;
  /** Value balance across groups. */
  valueBalancePct: number;
}

export interface DistributionBucket { key: string; count: number }

export interface WhiteSpace {
  /** Customers with no route assignment. */
  unassigned: string[];
  /** Customers never visited (coverage = never_visited). */
  neverVisited: string[];
  /** Customers with no visit cadence set. */
  noCadence: string[];
  counts: { unassigned: number; neverVisited: number; noCadence: number; total: number };
}

export interface TerritoryAudit {
  mode: TisMode;
  capabilities: TisCapabilities;
  /** Coverage gaps = under + never, with a rollup + per-group breakdown. */
  coverageGaps: { available: boolean; rollup: CoverageRollup; byGroup: GroupBalance[] };
  territoryBalance: BalanceSection | null;
  routeBalance: BalanceSection | null;
  distribution: { byGrade: DistributionBucket[]; byCoverage: DistributionBucket[]; assigned: number; unassigned: number };
  whiteSpace: WhiteSpace;
  headline: {
    customers: number;
    coveragePct: number;
    gapCount: number;          // under + never
    worstBalancePct: number;   // min(workload balance across territory & route)
    whiteSpaceCount: number;   // distinct un-worked outlets
  };
}

const keyOfGroup = (c: TisCustomer, by: AuditGroupBy): string | null =>
  by === 'route' ? c.ownership.routeId : by === 'region' ? c.ownership.regionId : c.ownership.salesmanId;

function balanceSection(customers: readonly TisCustomer[], by: AuditGroupBy): BalanceSection {
  const groups = new Map<string, TisCustomer[]>();
  for (const c of customers) {
    const k = keyOfGroup(c, by) ?? '';
    const list = groups.get(k) ?? [];
    list.push(c);
    groups.set(k, list);
  }
  const rows: GroupBalance[] = [...groups.entries()].map(([key, list]) => {
    const workload = list.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0);
    const salesValue = list.reduce((s, c) => s + (c.salesValue ?? 0), 0);
    const statuses = list.map((c) => c.coverage).filter((s): s is NonNullable<typeof s> => s != null);
    return { key, customers: list.length, workload: round1(workload), salesValue: round1(salesValue), coveragePct: rollupCoverage(statuses).coveragePct };
  });
  // Balance computed over assigned groups only (exclude the '' unassigned bucket).
  const assigned = rows.filter((r) => r.key);
  return {
    groupBy: by,
    groups: rows.sort((a, b) => a.coveragePct - b.coveragePct || b.workload - a.workload),
    workloadBalancePct: balancePct(assigned.map((r) => r.workload)),
    valueBalancePct: balancePct(assigned.map((r) => r.salesValue)),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Run the full territory audit over a dataset. Pure. */
export function auditTerritory(dataset: TisDataset): TerritoryAudit {
  const { mode, capabilities } = resolveCapabilities(dataset);
  const customers = dataset.customers;

  // Coverage gaps (Mode B/C). In Mode A there is no coverage signal.
  const allStatuses = customers.map((c) => c.coverage).filter((s): s is NonNullable<typeof s> => s != null);
  const rollup = rollupCoverage(allStatuses);
  const coverageGaps = {
    available: capabilities.coverageOverlay,
    rollup,
    byGroup: capabilities.coverageOverlay ? balanceSection(customers, 'salesman').groups : [],
  };

  // Imbalance: territory (region) + route, when those signals carry weight.
  const territoryBalance = capabilities.territoryAudit ? balanceSection(customers, 'region') : null;
  const routeBalance = capabilities.routeOptimization || capabilities.territoryAudit ? balanceSection(customers, 'route') : null;

  // Distribution.
  const byGrade = bucketize(customers, (c) => c.grade ?? '—');
  const byCoverage = bucketize(customers, (c) => c.coverage ?? '—');
  const assigned = customers.filter((c) => c.ownership.routeId).length;

  // Internal white-space (no external prospect source needed).
  const unassigned = customers.filter((c) => !c.ownership.routeId).map((c) => c.id);
  const neverVisited = customers.filter((c) => c.coverage === 'never_visited').map((c) => c.id);
  const noCadence = customers.filter((c) => c.frequency == null).map((c) => c.id);
  const whiteSpaceIds = new Set([...unassigned, ...neverVisited, ...noCadence]);
  const whiteSpace: WhiteSpace = {
    unassigned, neverVisited, noCadence,
    counts: { unassigned: unassigned.length, neverVisited: neverVisited.length, noCadence: noCadence.length, total: whiteSpaceIds.size },
  };

  const gapCount = rollup.underCovered + rollup.neverVisited;
  const balances = [territoryBalance?.workloadBalancePct, routeBalance?.workloadBalancePct].filter((v): v is number => v != null);
  const worstBalancePct = balances.length ? Math.min(...balances) : 100;

  return {
    mode, capabilities, coverageGaps, territoryBalance, routeBalance,
    distribution: { byGrade, byCoverage, assigned, unassigned: customers.length - assigned },
    whiteSpace,
    headline: {
      customers: customers.length,
      coveragePct: rollup.coveragePct,
      gapCount,
      worstBalancePct,
      whiteSpaceCount: whiteSpaceIds.size,
    },
  };
}

function bucketize(customers: readonly TisCustomer[], keyOf: (c: TisCustomer) => string): DistributionBucket[] {
  const m = new Map<string, number>();
  for (const c of customers) {
    const k = keyOf(c);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}
