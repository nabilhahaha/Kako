'use server';

// ============================================================================
// Field Verification — Coverage Map data (read-only). getFvCoverage returns one row per
// in-scope customer + its verification status for the Coverage Map dashboard. Company-scoped +
// permission-gated (admin or field_verification.reports); the heavy lifting + the scope are
// enforced in the SECURITY DEFINER erp_fv_coverage RPC (0377). Photo IDs only — signed URLs
// are resolved lazily in the UI (PR 2). No writes; reuses existing report-access gate.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { canViewFvReports } from './fv-report-access';
import type { CoverageRow, CoverageFilters, CoveragePoint, CoverageSummary } from './fv-coverage';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function reportGate() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ok: false as const };
  if (!canViewFvReports(ctx)) return { err: 'err_forbidden' as const, ok: false as const };
  return { err: null, ok: true as const };
}

function mapRow(r: Record<string, unknown>): CoverageRow {
  return {
    customerId: r.customer_id as string,
    code: (r.code as string | null) ?? null,
    name: (r.name as string) ?? '',
    city: (r.city as string | null) ?? null,
    area: (r.area as string | null) ?? null,
    channel: (r.channel as string | null) ?? null,
    salesman: (r.salesman as string | null) ?? null,
    assignedRep: (r.assigned_rep as string | null) ?? null,
    lat: (r.lat as number | null) ?? null,
    lng: (r.lng as number | null) ?? null,
    datasetId: (r.dataset_id as string | null) ?? null,
    datasetName: (r.dataset_name as string | null) ?? null,
    datasetStatus: (r.dataset_status as string | null) ?? null,
    visited: !!r.visited,
    verifiedAt: (r.verified_at as string | null) ?? null,
    distanceM: (r.distance_m as number | null) ?? null,
    allowedRadiusM: (r.allowed_radius_m as number | null) ?? null,
    radiusEnforced: (r.radius_enforced as boolean | null) ?? null,
    outsidePhotoId: (r.outside_photo as string | null) ?? null,
    insidePhotoIds: ((r.inside_photos as string[] | null) ?? []).filter((x) => typeof x === 'string' && x),
    notes: (r.notes as string | null) ?? null,
  };
}

/** Coverage rows for the caller's allowed scope (admin/viewer/reporter → company-wide;
 *  supervisor → temporarily company-wide per the documented report-visibility fallback). */
export async function getFvCoverage(f: CoverageFilters = {}): Promise<ResultD<CoverageRow[]>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  if (!canViewFvReports(ctx)) return { ok: false, error: 'err_forbidden' };

  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_fv_coverage', {
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_salesman: f.salesman ?? null,
    p_status: f.status ?? null,
    p_dataset_id: f.datasetId ?? null,
    p_include_archived: f.includeArchived ?? false,
    p_search: f.search ?? null,
    p_limit: f.limit ?? 50000,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(mapRow) };
}

// ── Lean coverage (perf): KPIs from a server count, markers from lean points, detail on tap. ──

/** Server-computed KPI counters (no row shipping). Respects every filter incl. status. */
export async function getFvCoverageSummary(f: CoverageFilters = {}): Promise<ResultD<CoverageSummary>> {
  const g = await reportGate();
  if (!g.ok) return { ok: false, error: g.err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_fv_coverage_summary', {
    p_from: f.from ?? null, p_to: f.to ?? null, p_salesman: f.salesman ?? null,
    p_status: f.status ?? null, p_dataset_id: f.datasetId ?? null,
    p_include_archived: f.includeArchived ?? false, p_search: f.search ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return {
    ok: true,
    data: {
      total: Number(r.total ?? 0), visited: Number(r.visited ?? 0),
      pending: Number(r.pending ?? 0), photos: Number(r.photos ?? 0),
    },
  };
}

/** Lean marker points (valid coords only), ordered pending→visited so green draws on top. */
export async function getFvCoveragePoints(f: CoverageFilters = {}): Promise<ResultD<CoveragePoint[]>> {
  const g = await reportGate();
  if (!g.ok) return { ok: false, error: g.err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_fv_coverage_points', {
    p_from: f.from ?? null, p_to: f.to ?? null, p_salesman: f.salesman ?? null,
    p_status: f.status ?? null, p_dataset_id: f.datasetId ?? null,
    p_include_archived: f.includeArchived ?? false, p_search: f.search ?? null,
    p_limit: f.limit ?? 60000,
  });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      customerId: r.customer_id as string,
      lat: (r.lat as number | null) ?? null,
      lng: (r.lng as number | null) ?? null,
      visited: !!r.visited,
    })),
  };
}

/** Full detail for one customer (the tapped marker's panel). */
export async function getFvCoverageDetail(customerId: string, from?: string | null, to?: string | null): Promise<ResultD<CoverageRow | null>> {
  const g = await reportGate();
  if (!g.ok) return { ok: false, error: g.err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_fv_coverage_detail', { p_customer_id: customerId, p_from: from ?? null, p_to: to ?? null });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as Record<string, unknown>[];
  return { ok: true, data: rows.length ? mapRow(rows[0]) : null };
}

export interface CoverageFacets {
  reps: { email: string; name: string }[];
  datasets: { id: string; name: string }[];
}

/** Rep + active-dataset option lists for the filter selects. */
export async function getFvCoverageFacets(): Promise<ResultD<CoverageFacets>> {
  const g = await reportGate();
  if (!g.ok) return { ok: false, error: g.err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_fv_coverage_facets');
  if (error) return { ok: false, error: error.message };
  const reps: { email: string; name: string }[] = [];
  const datasets: { id: string; name: string }[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (r.kind === 'rep') reps.push({ email: r.value as string, name: (r.label as string) || (r.value as string) });
    else if (r.kind === 'dataset') datasets.push({ id: r.value as string, name: (r.label as string) || (r.value as string) });
  }
  reps.sort((a, b) => a.name.localeCompare(b.name));
  datasets.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: { reps, datasets } };
}
