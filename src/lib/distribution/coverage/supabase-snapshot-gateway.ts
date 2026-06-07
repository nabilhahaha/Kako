// ============================================================================
// Distribution — Supabase impl of the SnapshotGateway (0193 erp_rep_day_kpis).
// Upsert under the caller's RLS (branch-scoped). server-only.
// ============================================================================

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { SnapshotGateway, RepDayKpiRow } from './snapshot';

type Db = Awaited<ReturnType<typeof createClient>>;

export function createSupabaseSnapshotGateway(db: Db): SnapshotGateway {
  return {
    async upsertRepDayKpi(row: RepDayKpiRow) {
      await db.from('erp_rep_day_kpis').upsert(
        {
          company_id: row.companyId, branch_id: row.branchId, salesman_id: row.salesmanId, kpi_date: row.kpiDate,
          planned: row.planned, visited: row.visited, planned_visited: row.plannedVisited, missed: row.missed,
          off_route: row.offRoute, productive: row.productive,
          coverage_pct: row.coveragePct, adherence_pct: row.adherencePct, strike_rate_pct: row.strikeRatePct,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'salesman_id,kpi_date' },
      );
    },
  };
}
