'use server';

// ============================================================================
// Multi-Form Field Work — Single Form Report actions (read-only).
//
// getFormReport returns a form's submissions via the SECURITY DEFINER erp_form_submissions
// RPC (0381): report-permission holders see all the company's rows for the form; others see
// only their own. getFormReportVersions returns each version's schema so the panel can render
// historical answers with the labels used AT SUBMISSION TIME. Photos reuse getVerificationPhotos.
// Company-scoped + field_verification.reports gated; no writes; FV reporting untouched.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { canViewFvReports } from './fv-report-access';
import { resolveFormSchema, type FormSchema } from '@/lib/forms/form-schema';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

const PENDING = 'err_report_pending_migration';

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

export interface FormSubmissionRow {
  id: string;
  version: number;
  recordId: string | null;
  recordCode: string | null;
  recordName: string | null;
  repName: string | null;
  createdBy: string | null;
  createdAt: string;
  status: string | null;
  answers: Record<string, unknown>;
  gpsLat: number | null;
  gpsLng: number | null;
  distanceM: number | null;
  allowedRadiusM: number | null;
  radiusEnforced: boolean | null;
  photoIds: string[];
}

export interface FormReportFilters {
  from?: string | null;
  to?: string | null;
  rep?: string | null;
  search?: string | null;
  limit?: number;
}

function mapRow(r: Record<string, unknown>): FormSubmissionRow {
  return {
    id: r.id as string,
    version: (r.version as number) ?? 0,
    recordId: (r.record_id as string | null) ?? null,
    recordCode: (r.record_code as string | null) ?? null,
    recordName: (r.record_name as string | null) ?? null,
    repName: (r.rep_name as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
    status: (r.status as string | null) ?? null,
    answers: ((r.answers as Record<string, unknown> | null) ?? {}),
    gpsLat: (r.gps_lat as number | null) ?? null,
    gpsLng: (r.gps_lng as number | null) ?? null,
    distanceM: (r.distance_m as number | null) ?? null,
    allowedRadiusM: (r.allowed_radius_m as number | null) ?? null,
    radiusEnforced: (r.radius_enforced as boolean | null) ?? null,
    photoIds: (((r.photo_ids as string[] | null) ?? []).filter((x) => typeof x === 'string' && x)),
  };
}

/** Submissions for a form, scoped by the RPC. */
export async function getFormReport(formId: string, f: FormReportFilters = {}): Promise<ResultD<FormSubmissionRow[]>> {
  const { err } = await reportCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.rpc('erp_form_submissions', {
    p_form_id: formId,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_rep: f.rep ?? null,
    p_search: f.search ?? null,
    p_limit: f.limit ?? 5000,
  });
  if (error) return { ok: false, error: rpcMissing(error) ? PENDING : error.message };
  return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(mapRow) };
}

export interface FormMeta { nameEn: string; nameAr: string; versions: Record<number, FormSchema> }

/** The form name + each version's schema (to render historical answers by submit-time version). */
export async function getFormReportVersions(formId: string): Promise<ResultD<FormMeta>> {
  const { err, ctx } = await reportCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();

  const { data: form } = await sb.from('erp_forms')
    .select('name_en, name_ar').eq('company_id', ctx.companyId).eq('id', formId).maybeSingle();
  if (!form) return { ok: false, error: 'err_not_found' };

  const { data: vers } = await sb.from('erp_form_versions')
    .select('version, schema').eq('form_id', formId);
  const versions: Record<number, FormSchema> = {};
  for (const v of (vers ?? []) as { version: number; schema: unknown }[]) {
    versions[v.version] = resolveFormSchema(v.schema);
  }
  const f = form as { name_en: string | null; name_ar: string | null };
  return { ok: true, data: { nameEn: f.name_en ?? '', nameAr: f.name_ar ?? '', versions } };
}

/** Signed photo URLs for an authorized report viewer. Reuses the FV photo action. */
export async function getFormReportPhotos(ids: string[]): Promise<ResultD<{ id: string; url: string }[]>> {
  const { err } = await reportCtx();
  if (err) return { ok: false, error: err };
  const { getVerificationPhotos } = await import('./rp-verification-actions');
  return getVerificationPhotos(ids);
}
