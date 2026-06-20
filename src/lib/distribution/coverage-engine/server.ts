import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadCustomerCoverage } from '@/lib/distribution/journey-plan/coverage-status-server';
import type { CoverageStatus } from '@/lib/distribution/journey-plan/coverage-status';
import { rollupCoverage, groupCoverageRollup, type CoverageRollup, type CoverageGroupRollup, type CoverageGroupBy } from './rollup';

/**
 * Coverage Engine — server rollup loader (CV-1). Read-only: reuses the single
 * CJ-3 `loadCustomerCoverage` read-model over the RLS-scoped customer set and
 * aggregates it. Manager/supervisor visibility follows existing branch/territory
 * RLS; optional filters narrow by salesman / route / region. No new logic.
 */
export type { CoverageGroupBy };

export interface CoverageRollupResult {
  overall: CoverageRollup;
  groups: CoverageGroupRollup[]; // key = id of the groupBy dimension ('' = unassigned)
  groupBy: CoverageGroupBy;
}

interface CustRow {
  id: string;
  salesman_id: string | null;
  route_id: string | null;
  region_id: string | null;
  status: CoverageStatus;
}

export async function loadCoverageRollup(
  supabase: SupabaseClient,
  opts: { groupBy?: CoverageGroupBy; salesmanId?: string; routeId?: string; regionId?: string; asOf?: string } = {},
): Promise<CoverageRollupResult> {
  const groupBy = opts.groupBy ?? 'salesman';

  let q = supabase
    .from('erp_customers')
    .select('id, salesman_id, route_id, region_id')
    .eq('is_active', true)
    .limit(5000);
  if (opts.salesmanId) q = q.eq('salesman_id', opts.salesmanId);
  if (opts.routeId) q = q.eq('route_id', opts.routeId);
  if (opts.regionId) q = q.eq('region_id', opts.regionId);

  let custs: { id: string; salesman_id: string | null; route_id: string | null; region_id: string | null }[] = [];
  try {
    const { data, error } = await q;
    if (!error) custs = (data as typeof custs) ?? [];
  } catch { custs = []; }

  const coverage = await loadCustomerCoverage(supabase, custs.map((c) => c.id), opts.asOf);

  const rows: CustRow[] = custs.map((c) => ({
    id: c.id,
    salesman_id: c.salesman_id,
    route_id: c.route_id,
    region_id: c.region_id,
    status: coverage.get(c.id)?.status ?? 'never_visited',
  }));

  const keyOf = (r: CustRow): string | null =>
    groupBy === 'route' ? r.route_id : groupBy === 'region' ? r.region_id : r.salesman_id;

  return {
    overall: rollupCoverage(rows.map((r) => r.status)),
    groups: groupCoverageRollup(rows, keyOf, (r) => r.status),
    groupBy,
  };
}

export { loadCustomerCoverage };
