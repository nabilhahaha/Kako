'use server';

// ============================================================================
// Phase C1 — read-only Route Planner dashboard. Company-scoped aggregate reads over the
// already-reconciled RP tables (RLS-enforced). No writes. Drives the manager/planner
// dashboard cards. Uses the merged mission status list (route-planner-mission).
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { MISSION_STATUSES, type MissionStatus } from '@/lib/erp/route-planner-mission';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface RpDashboard {
  datasets: number;
  totalCustomers: number;
  validCustomers: number;
  coveragePct: number;            // valid / total * 100
  activeDataset: string | null;
  dayPlans: number;
  journeyPlans: number;
  missionsByStatus: Record<MissionStatus, number>;
  missionsTotal: number;
  missionAdherencePct: number;    // (completed+reviewed) / (assigned+in_progress+completed+reviewed)
  dataSources: number;
  fieldMappings: number;
  lastSync: { status: string; label: string | null; at: string | null; imported: number } | null;
}

async function ctxOrNull() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}

export async function getRpDashboard(): Promise<Result<RpDashboard>> {
  const ctx = await ctxOrNull();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const company = ctx.companyId;

  const headCount = async (table: string, status?: string): Promise<number> => {
    let q = sb.from(table).select('*', { count: 'exact', head: true }).eq('company_id', company);
    if (status !== undefined) q = q.eq('status', status);
    const { count } = await q;
    return count ?? 0;
  };

  // Datasets (small N) — pull headers to sum rows + find the active one.
  const { data: dsRows } = await sb.from('erp_rp_datasets')
    .select('name, row_count, valid_count, is_active').eq('company_id', company);
  const datasets = dsRows?.length ?? 0;
  const totalCustomers = (dsRows ?? []).reduce((s, r) => s + (Number(r.row_count) || 0), 0);
  const validCustomers = (dsRows ?? []).reduce((s, r) => s + (Number(r.valid_count) || 0), 0);
  const activeDataset = (dsRows ?? []).find((r) => r.is_active)?.name ?? null;
  const coveragePct = totalCustomers > 0 ? Math.round((validCustomers / totalCustomers) * 100) : 0;

  // Plans + integration counts.
  const [dayPlans, journeyPlans, dataSources, fieldMappings] = await Promise.all([
    headCount('erp_rp_day_plans', 'active'),
    headCount('erp_rp_journey_plans', 'active'),
    headCount('erp_rp_data_sources'),
    headCount('erp_rp_field_mappings'),
  ]);

  // Missions by canonical status (merged list).
  const counts = await Promise.all(
    MISSION_STATUSES.map((s) => headCount('erp_rp_missions', s)),
  );
  const missionsByStatus = Object.fromEntries(MISSION_STATUSES.map((s, i) => [s, counts[i]])) as Record<MissionStatus, number>;
  const missionsTotal = counts.reduce((a, b) => a + b, 0);
  const assignedish = missionsByStatus.assigned + missionsByStatus.in_progress + missionsByStatus.completed + missionsByStatus.reviewed;
  const doneish = missionsByStatus.completed + missionsByStatus.reviewed;
  const missionAdherencePct = assignedish > 0 ? Math.round((doneish / assignedish) * 100) : 0;

  // Last sync run.
  const { data: sync } = await sb.from('erp_rp_sync_runs')
    .select('status, source_label, started_at, finished_at, rows_imported')
    .eq('company_id', company).order('started_at', { ascending: false }).limit(1).maybeSingle();
  const lastSync = sync
    ? { status: sync.status as string, label: (sync.source_label as string | null) ?? null, at: (sync.finished_at as string | null) ?? (sync.started_at as string | null), imported: (sync.rows_imported as number) ?? 0 }
    : null;

  return {
    ok: true,
    data: {
      datasets, totalCustomers, validCustomers, coveragePct, activeDataset,
      dayPlans, journeyPlans, missionsByStatus, missionsTotal, missionAdherencePct,
      dataSources, fieldMappings, lastSync,
    },
  };
}
