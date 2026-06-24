'use server';

// ============================================================================
// Multi-Form Field Work — Forms Overview + Cross-Form dashboard actions (read-only).
//
// getFormsOverview → per-form rollups (erp_forms_overview, 0382). getFormsCross → common
// columns across all custom forms (erp_forms_cross, 0382). Both scoped in the SECURITY DEFINER
// RPCs (report-permission holders see all company rows; others their own). Company-scoped +
// field_verification.reports gated. No writes; FV reporting untouched. Pending-migration safe.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { canViewFvReports } from './fv-report-access';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };
const PENDING = 'err_dash_pending_migration';

function rpcMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  return code === '42883' || code === 'PGRST202' || msg.includes('does not exist') || msg.includes('schema cache');
}

async function reportCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!canViewFvReports(ctx)) return { err: 'err_forbidden' as const, ctx: null };
  return { err: null, ctx };
}

export interface FormOverviewRow {
  formId: string; code: string; nameEn: string; nameAr: string; isActive: boolean;
  assignedCount: number; submissions: number; photos: number; lastSubmission: string | null;
}

export async function getFormsOverview(): Promise<ResultD<FormOverviewRow[]>> {
  const { err } = await reportCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_forms_overview');
  if (error) return { ok: false, error: rpcMissing(error) ? PENDING : error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      formId: r.form_id as string,
      code: r.code as string,
      nameEn: (r.name_en as string | null) ?? '',
      nameAr: (r.name_ar as string | null) ?? '',
      isActive: !!r.is_active,
      assignedCount: (r.assigned_count as number) ?? 0,
      submissions: (r.submissions as number) ?? 0,
      photos: (r.photos as number) ?? 0,
      lastSubmission: (r.last_submission as string | null) ?? null,
    })),
  };
}

export interface CrossRow {
  responseId: string; formId: string; formName: string; version: number;
  recordId: string | null; recordCode: string | null; recordName: string | null; city: string | null;
  createdBy: string | null; repName: string | null; createdAt: string; status: string | null;
  gpsLat: number | null; gpsLng: number | null; photoCount: number;
}

export interface CrossFilters {
  from?: string | null; to?: string | null; formId?: string | null;
  rep?: string | null; search?: string | null; city?: string | null; limit?: number;
}

export async function getFormsCross(f: CrossFilters = {}): Promise<ResultD<CrossRow[]>> {
  const { err } = await reportCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_forms_cross', {
    p_from: f.from ?? null, p_to: f.to ?? null, p_form: f.formId ?? null,
    p_rep: f.rep ?? null, p_search: f.search ?? null, p_city: f.city ?? null, p_limit: f.limit ?? 5000,
  });
  if (error) return { ok: false, error: rpcMissing(error) ? PENDING : error.message };
  return {
    ok: true,
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      responseId: r.response_id as string,
      formId: r.form_id as string,
      formName: (r.form_name as string | null) ?? '',
      version: (r.version as number) ?? 0,
      recordId: (r.record_id as string | null) ?? null,
      recordCode: (r.record_code as string | null) ?? null,
      recordName: (r.record_name as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      createdBy: (r.created_by as string | null) ?? null,
      repName: (r.rep_name as string | null) ?? null,
      createdAt: r.created_at as string,
      status: (r.status as string | null) ?? null,
      gpsLat: (r.gps_lat as number | null) ?? null,
      gpsLng: (r.gps_lng as number | null) ?? null,
      photoCount: (r.photo_count as number) ?? 0,
    })),
  };
}
