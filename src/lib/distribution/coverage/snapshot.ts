// ============================================================================
// Distribution — rep-day KPI snapshot service (Phase 3). Computes a rep's coverage
// KPIs for a day (via the coverage read-model) and upserts them into
// erp_rep_day_kpis (0193) for supervisor dashboards/trends. Idempotent per
// (salesman, date). No-op unless KAKO_DISTRIBUTION is on.
// ============================================================================

import { DISTRIBUTION_ENABLED } from '../flags';
import { getRepDayCoverage } from './service';
import type { CoverageGateway } from './gateway';
import type { CoverageKpis } from './kpi';

export interface RepDayKpiRow extends CoverageKpis {
  companyId: string;
  branchId: string;
  salesmanId: string;
  kpiDate: string;
}

export interface SnapshotGateway {
  /** Upsert one rep-day KPI snapshot (conflict on salesman_id + kpi_date). */
  upsertRepDayKpi(row: RepDayKpiRow): Promise<void>;
}

export interface SnapshotInput {
  companyId: string;
  branchId: string;
  salesmanId: string;
  date: string;
}

export type SnapshotResult =
  | { snapshotted: true; kpis: CoverageKpis }
  | { snapshotted: false; reason: 'disabled' };

/** Compute + persist a rep-day KPI snapshot. */
export async function snapshotRepDay(
  coverageGw: CoverageGateway,
  snapshotGw: SnapshotGateway,
  input: SnapshotInput,
): Promise<SnapshotResult> {
  if (!DISTRIBUTION_ENABLED()) return { snapshotted: false, reason: 'disabled' };

  const cov = await getRepDayCoverage(coverageGw, input.salesmanId, input.date);
  const { salesmanId: _s, date: _d, ...kpis } = cov;
  await snapshotGw.upsertRepDayKpi({
    companyId: input.companyId,
    branchId: input.branchId,
    salesmanId: input.salesmanId,
    kpiDate: input.date,
    ...kpis,
  });
  return { snapshotted: true, kpis };
}
