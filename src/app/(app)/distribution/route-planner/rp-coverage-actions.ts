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
import type { CoverageRow, CoverageFilters } from './fv-coverage';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

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
