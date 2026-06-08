// ============================================================================
// Route & Territory Intelligence — dashboard read-models (Phase 7D). Pure rollups
// for the territory / route / salesman / supervisor dashboards over health rows
// (sourced from coverage KPIs + erp_rep_day_kpis snapshots). No I/O.
// ============================================================================

export interface HealthRow {
  entityId: string;
  entityType: 'route' | 'salesman' | 'territory';
  healthScore: number;       // 0..100
  band: string;
  coveragePct: number;
  strikeRatePct: number;
  adherencePct: number;
  missedCustomers: number;
  territoryId?: string | null;
  supervisorId?: string | null;
  period?: string;
}

const avg = (ns: number[]): number => (ns.length ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length) : 0);
const sum = (ns: number[]): number => ns.reduce((s, n) => s + n, 0);

/** Salesman dashboard — ranked by health (weakest first for action). Pure. */
export function salesmanDashboard(rows: readonly HealthRow[]): HealthRow[] {
  return rows.filter((r) => r.entityType === 'salesman').sort((a, b) => a.healthScore - b.healthScore);
}

/** Route dashboard — ranked weakest first. Pure. */
export function routeDashboard(rows: readonly HealthRow[]): HealthRow[] {
  return rows.filter((r) => r.entityType === 'route').sort((a, b) => a.healthScore - b.healthScore);
}

/** Supervisor dashboard — per-supervisor team rollup. Pure. */
export function supervisorDashboard(rows: readonly HealthRow[]) {
  const by = new Map<string, HealthRow[]>();
  for (const r of rows.filter((x) => x.entityType === 'salesman')) {
    const k = r.supervisorId ?? 'unassigned';
    (by.get(k) ?? by.set(k, []).get(k)!).push(r);
  }
  return [...by.entries()]
    .map(([supervisorId, rs]) => ({
      supervisorId, team: rs.length,
      avgHealth: avg(rs.map((r) => r.healthScore)),
      avgCoverage: avg(rs.map((r) => r.coveragePct)),
      missedCustomers: sum(rs.map((r) => r.missedCustomers)),
    }))
    .sort((a, b) => a.avgHealth - b.avgHealth);
}

/** Territory (management) dashboard — per-territory rollup + coverage gaps. Pure. */
export function territoryDashboard(rows: readonly HealthRow[]) {
  const by = new Map<string, HealthRow[]>();
  for (const r of rows) {
    const k = r.territoryId ?? 'unassigned';
    (by.get(k) ?? by.set(k, []).get(k)!).push(r);
  }
  return [...by.entries()]
    .map(([territoryId, rs]) => ({
      territoryId, entities: rs.length,
      avgHealth: avg(rs.map((r) => r.healthScore)),
      avgCoverage: avg(rs.map((r) => r.coveragePct)),
      avgStrikeRate: avg(rs.map((r) => r.strikeRatePct)),
      missedCustomers: sum(rs.map((r) => r.missedCustomers)),
    }))
    .sort((a, b) => b.avgHealth - a.avgHealth);
}
