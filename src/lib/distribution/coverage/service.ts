// ============================================================================
// Distribution — coverage read-model service (Phase 3). Pure orchestration over
// the coverage gateway + the pure KPI engine: loads a rep's planned journey +
// actual visits for a day and returns the coverage/adherence/strike-rate KPIs a
// supervisor monitors. Read-only — computes from existing data, mutates nothing.
// A supervisor roll-up composes per-rep results via rollupCoverage().
// ============================================================================

import { coverageKpis, rollupCoverage, type CoverageKpis } from './kpi';
import type { CoverageGateway } from './gateway';

export interface RepDayCoverage extends CoverageKpis {
  salesmanId: string;
  date: string;
}

/** Coverage KPIs for one rep on one day. */
export async function getRepDayCoverage(gw: CoverageGateway, salesmanId: string, date: string): Promise<RepDayCoverage> {
  const [planned, visits] = await Promise.all([
    gw.loadPlannedCustomers(salesmanId, date),
    gw.loadVisits(salesmanId, date),
  ]);
  return { salesmanId, date, ...coverageKpis(planned, visits) };
}

/** Coverage roll-up for a supervisor's team (several reps) on a day. */
export async function getTeamDayCoverage(
  gw: CoverageGateway,
  salesmanIds: string[],
  date: string,
): Promise<{ date: string; perRep: RepDayCoverage[]; total: CoverageKpis }> {
  const perRep = await Promise.all(salesmanIds.map((id) => getRepDayCoverage(gw, id, date)));
  return { date, perRep, total: rollupCoverage(perRep) };
}
