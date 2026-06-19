import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseFrequency } from '@/lib/route-optimization/visit-frequency';
import { loadCustomerCoverage } from '@/lib/distribution/coverage-engine/server';
import { buildTisCustomer, buildTisDataset, type TisCustomer, type TisDataset } from './dataset';

/**
 * TIS adapter — live DB → canonical dataset (TIS-0-4, I/O half). Composes the
 * RLS-scoped customer master with the Coverage Engine read-model (CV-1) and the
 * FR customer-level frequency, producing the same TisDataset shape the upload
 * adapter does. Best-effort + read-only: missing signals just downgrade
 * capabilities (TIS-0-2). Heavier enrichments (sales rollup, health, grade
 * history) are layered in later stages.
 */
async function safeRows<T>(fn: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try { const { data, error } = await fn(); return error ? [] : ((data as T[]) ?? []); } catch { return []; }
}

export async function loadTisDataset(
  supabase: SupabaseClient,
  opts: { asOf?: string; salesmanId?: string; routeId?: string; regionId?: string; limit?: number } = {},
): Promise<TisDataset> {
  let q = supabase
    .from('erp_customers')
    .select('id, code, name, name_ar, latitude, longitude, salesman_id, route_id, region_id, area_id, visit_frequency')
    .eq('is_active', true)
    .limit(opts.limit ?? 5000);
  if (opts.salesmanId) q = q.eq('salesman_id', opts.salesmanId);
  if (opts.routeId) q = q.eq('route_id', opts.routeId);
  if (opts.regionId) q = q.eq('region_id', opts.regionId);

  const rows = await safeRows<{
    id: string; code: string | null; name: string; name_ar: string | null;
    latitude: number | null; longitude: number | null;
    salesman_id: string | null; route_id: string | null; region_id: string | null; area_id: string | null;
    visit_frequency: string | null;
  }>(() => q);

  const ids = rows.map((r) => r.id);
  const coverage = await loadCustomerCoverage(supabase, ids, opts.asOf);

  // rep → supervisor (reports_to), for ownership.supervisorId.
  const repIds = [...new Set(rows.map((r) => r.salesman_id).filter((x): x is string => !!x))];
  const supervisorByRep = new Map<string, string>();
  if (repIds.length > 0) {
    const profs = await safeRows<{ id: string; reports_to: string | null }>(() =>
      supabase.from('erp_profiles').select('id, reports_to').in('id', repIds),
    );
    for (const p of profs) if (p.reports_to) supervisorByRep.set(p.id, p.reports_to);
  }

  const customers: TisCustomer[] = rows.map((r) =>
    buildTisCustomer({
      id: r.id,
      code: r.code,
      name: r.name_ar || r.name,
      geo: r.latitude != null && r.longitude != null ? { lat: Number(r.latitude), lng: Number(r.longitude) } : null,
      ownership: {
        salesmanId: r.salesman_id,
        supervisorId: r.salesman_id ? supervisorByRep.get(r.salesman_id) ?? null : null,
        areaId: r.area_id,
        regionId: r.region_id,
        routeId: r.route_id,
      },
      frequency: parseFrequency(r.visit_frequency),
      coverage: coverage.get(r.id)?.status ?? null,
    }),
  );

  return buildTisDataset(customers, { source: 'live', asOf: opts.asOf });
}
