'use server';

// ============================================================================
// Multi-Form Field Work — rep "My Forms" + runner actions.
//
// getMyForms lists the published+active custom forms ASSIGNED to the caller (resolved from
// the caller's org scope + erp_form_assignments via the pure userCanAccessForm). The runner
// reads one form's published schema (re-gated) and submits ONE immutable erp_form_responses
// row tied to (form_id, version). The Field Verification flow (erp_rp_customer_verifications,
// /field-verification/my-customers) is NOT touched — custom forms only.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { resolveFormSchema, type FormSchema } from '@/lib/forms/form-schema';
import {
  userCanAccessForm, customerScopeFilters, type FormAssignment, type UserScope,
} from '@/lib/forms/form-assignments';
import { validateSubmission, buildResponsePhotoIds, sanitizeAnswers } from '@/lib/forms/form-submission';
import { isReservedFormCode } from './forms-library';

type Result = { ok: true } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

async function repCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!hasPermission(ctx, 'field_verification.verify')) return { err: 'err_forbidden' as const, ctx: null };
  if (!FORM_BUILDER_ENABLED()) return { err: 'err_form_builder_disabled' as const, ctx: null };
  return { err: null, ctx };
}

function repEmail(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): string | null {
  return (ctx.profile as { email?: string | null } | null)?.email ?? null;
}

/** Resolve the caller's org scope for assignment matching (roles/teams/branches/depts +
 *  the reporting ancestors used by 'supervisor' targets). Bounded reports_to walk. */
async function resolveScope(sb: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<UserScope> {
  const { data: ubs } = await sb.from('erp_user_branches')
    .select('role, team_id, branch_id, department_id, reports_to').eq('user_id', userId);
  const rows = (ubs ?? []) as { role: string | null; team_id: string | null; branch_id: string | null; department_id: string | null; reports_to: string | null }[];
  const roles = [...new Set(rows.map((r) => r.role).filter(Boolean) as string[])];
  const teamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean) as string[])];
  const branchIds = [...new Set(rows.map((r) => r.branch_id).filter(Boolean) as string[])];
  const departmentIds = [...new Set(rows.map((r) => r.department_id).filter(Boolean) as string[])];

  const supervisorIds = new Set<string>([userId]);
  let frontier = [...new Set(rows.map((r) => r.reports_to).filter(Boolean) as string[])];
  for (let depth = 0; depth < 12 && frontier.length > 0; depth++) {
    const fresh = frontier.filter((id) => !supervisorIds.has(id));
    fresh.forEach((id) => supervisorIds.add(id));
    if (fresh.length === 0) break;
    const { data } = await sb.from('erp_user_branches').select('reports_to').in('user_id', fresh);
    frontier = [...new Set((data ?? []).map((r) => r.reports_to as string | null).filter(Boolean) as string[])];
  }
  return { userId, roles, teamIds, branchIds, departmentIds, supervisorIds: [...supervisorIds] };
}

function mapAssignments(rows: { target_type: string; target_value: string; is_active: boolean }[]): FormAssignment[] {
  return rows.map((r) => ({ targetType: r.target_type as FormAssignment['targetType'], targetValue: r.target_value, isActive: !!r.is_active }));
}

export interface MyFormCard {
  id: string; code: string; nameEn: string; nameAr: string;
  version: number; settings: FormSchema['settings']; fieldCount: number;
}

/** Published+active custom forms assigned to the caller. */
export async function getMyForms(): Promise<ResultD<MyFormCard[]>> {
  const { err, ctx } = await repCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();

  const { data: forms } = await sb.from('erp_forms')
    .select('id, code, name_en, name_ar, is_active').eq('company_id', ctx.companyId).eq('is_active', true);
  const formRows = ((forms ?? []) as { id: string; code: string; name_en: string | null; name_ar: string | null }[])
    .filter((f) => !isReservedFormCode(f.code));
  if (formRows.length === 0) return { ok: true, data: [] };
  const ids = formRows.map((f) => f.id);

  const { data: vers } = await sb.from('erp_form_versions')
    .select('form_id, version, schema, status').in('form_id', ids).eq('status', 'published');
  // latest published per form
  const pub = new Map<string, { version: number; schema: unknown }>();
  for (const v of (vers ?? []) as { form_id: string; version: number; schema: unknown }[]) {
    const cur = pub.get(v.form_id);
    if (!cur || v.version > cur.version) pub.set(v.form_id, { version: v.version, schema: v.schema });
  }

  const { data: asn, error: aErr } = await sb.from('erp_form_assignments')
    .select('form_id, target_type, target_value, is_active').eq('company_id', ctx.companyId).in('form_id', ids);
  if (aErr) return { ok: false, error: aErr.message };
  const byForm = new Map<string, FormAssignment[]>();
  for (const a of (asn ?? []) as { form_id: string; target_type: string; target_value: string; is_active: boolean }[]) {
    const arr = byForm.get(a.form_id) ?? [];
    arr.push({ targetType: a.target_type as FormAssignment['targetType'], targetValue: a.target_value, isActive: !!a.is_active });
    byForm.set(a.form_id, arr);
  }

  const scope = await resolveScope(sb, ctx.userId);
  const out: MyFormCard[] = [];
  for (const f of formRows) {
    const p = pub.get(f.id);
    if (!p) continue; // not published
    if (!userCanAccessForm(byForm.get(f.id) ?? [], scope)) continue;
    const schema = resolveFormSchema(p.schema);
    out.push({ id: f.id, code: f.code, nameEn: f.name_en ?? '', nameAr: f.name_ar ?? '', version: p.version, settings: schema.settings, fieldCount: schema.fields.length });
  }
  return { ok: true, data: out };
}

/** Internal: load a form + its latest published version IF the caller is assigned. */
async function loadAssignedForm(sb: Awaited<ReturnType<typeof createClient>>, ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>, formId: string) {
  const { data: form } = await sb.from('erp_forms')
    .select('id, code, name_en, name_ar, is_active').eq('company_id', ctx.companyId).eq('id', formId).maybeSingle();
  const f = form as { id: string; code: string; name_en: string | null; name_ar: string | null; is_active: boolean } | null;
  if (!f || isReservedFormCode(f.code) || !f.is_active) return null;

  const { data: ver } = await sb.from('erp_form_versions')
    .select('version, schema').eq('form_id', formId).eq('status', 'published').order('version', { ascending: false }).limit(1).maybeSingle();
  const v = ver as { version: number; schema: unknown } | null;
  if (!v) return null;

  const { data: asn } = await sb.from('erp_form_assignments')
    .select('target_type, target_value, is_active').eq('company_id', ctx.companyId).eq('form_id', formId);
  const scope = await resolveScope(sb, ctx.userId);
  if (!userCanAccessForm(mapAssignments((asn ?? []) as never), scope)) return null;

  return { form: f, version: v.version, schema: resolveFormSchema(v.schema), filters: customerScopeFilters(mapAssignments((asn ?? []) as never)) };
}

export interface FormForFill { id: string; nameEn: string; nameAr: string; version: number; schema: FormSchema }

/** The published schema for filling, only if the caller is assigned. */
export async function getFormForFill(formId: string): Promise<ResultD<FormForFill>> {
  const { err, ctx } = await repCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const loaded = await loadAssignedForm(sb, ctx, formId);
  if (!loaded) return { ok: false, error: 'err_forbidden' };
  return { ok: true, data: { id: loaded.form.id, nameEn: loaded.form.name_en ?? '', nameAr: loaded.form.name_ar ?? '', version: loaded.version, schema: loaded.schema } };
}

export interface MyFormCustomer { id: string; code: string | null; name: string; city: string | null; channel: string | null; lat: number | null; lng: number | null }

/** In-scope customers for a customer-linked form: the caller's assigned customers, narrowed
 *  by the form's customer-scope assignments (dataset/city/channel). */
export async function getMyFormCustomers(formId: string, search?: string): Promise<ResultD<MyFormCustomer[]>> {
  const { err, ctx } = await repCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const loaded = await loadAssignedForm(sb, ctx, formId);
  if (!loaded) return { ok: false, error: 'err_forbidden' };

  const me = repEmail(ctx);
  if (!me) return { ok: true, data: [] };

  const { data: archived } = await sb.from('erp_rp_datasets').select('id').eq('company_id', ctx.companyId).eq('status', 'archived');
  const archivedIds = (archived ?? []).map((d) => d.id as string);

  let q = sb.from('erp_rp_dataset_customers')
    .select('id, code, name, city, channel, lat, lng, dataset_id')
    .eq('company_id', ctx.companyId).eq('salesman', me);
  const { datasetIds, cities, channels } = loaded.filters;
  if (datasetIds.length > 0) q = q.in('dataset_id', datasetIds);
  if (cities.length > 0) q = q.in('city', cities);
  if (channels.length > 0) q = q.in('channel', channels);
  const term = (search ?? '').trim();
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await q.limit(50);
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as { id: string; code: string | null; name: string | null; city: string | null; channel: string | null; lat: number | null; lng: number | null; dataset_id: string | null }[];
  return {
    ok: true,
    data: rows
      .filter((c) => !c.dataset_id || !archivedIds.includes(c.dataset_id))
      .map((c) => ({ id: c.id, code: c.code, name: c.name ?? '', city: c.city, channel: c.channel, lat: c.lat, lng: c.lng })),
  };
}

export interface SubmitFormInput {
  formId: string;
  customerId?: string | null;
  answers: Record<string, unknown>;
  photoIdsByField?: Record<string, string[]>;
  gps?: { lat: number; lng: number } | null;
}

/** Submit one immutable response for a form, tied to (form_id, version). Server-validated. */
export async function submitFormResponse(input: SubmitFormInput): Promise<Result> {
  const { err, ctx } = await repCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const loaded = await loadAssignedForm(sb, ctx, input.formId);
  if (!loaded) return { ok: false, error: 'err_forbidden' };
  const { schema, version } = loaded;

  const errors = validateSubmission(schema, {
    answers: input.answers ?? {}, customerId: input.customerId, photoIdsByField: input.photoIdsByField, hasGps: !!input.gps,
  });
  if (errors.length > 0) return { ok: false, error: 'err_invalid_submission' };

  // Snapshot the linked customer (must be the caller's own assigned customer).
  let recordCode: string | null = null, recordName: string | null = null, recordId: string | null = null;
  if (schema.settings.customerLink !== 'none' && input.customerId) {
    const me = repEmail(ctx);
    const { data: cust } = await sb.from('erp_rp_dataset_customers')
      .select('id, code, name, salesman').eq('company_id', ctx.companyId).eq('id', input.customerId).maybeSingle();
    const c = cust as { id: string; code: string | null; name: string | null; salesman: string | null } | null;
    if (!c || (me && c.salesman !== me)) return { ok: false, error: 'err_customer_scope' };
    recordId = c.id; recordCode = c.code; recordName = c.name;
  }

  const photoIds = buildResponsePhotoIds(schema, input.photoIdsByField);
  const answers = sanitizeAnswers(schema, input.answers ?? {});

  const { error } = await sb.from('erp_form_responses').insert({
    company_id: ctx.companyId, form_id: input.formId, version, entity: 'customer', record_id: recordId,
    record_code: recordCode, record_name: recordName, answers, status: 'submitted',
    gps_lat: input.gps?.lat ?? null, gps_lng: input.gps?.lng ?? null,
    allowed_radius_m: schema.settings.radiusM ?? null, radius_enforced: schema.settings.requireGps,
    photo_ids: photoIds, created_by: ctx.userId,
  });
  if (error) return { ok: false, error: error.message };

  await logAudit(sb, { action: 'submit_response', entity: 'form', entityId: input.formId, companyId: ctx.companyId, details: { version, customerId: recordId } });
  return { ok: true };
}
