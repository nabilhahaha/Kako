'use server';

// ============================================================================
// Multi-Form Field Work — Forms Library admin actions (company admin / forms.admin).
//
// List / create / duplicate / activate custom forms. Reuses the existing 0240 forms
// backbone (erp_forms + erp_form_versions). The Field Verification form ('fv_verification')
// and the bound Customer-Data-Update form are RESERVED and never managed here — they keep
// their dedicated screens. Definition-only writes: never a response, customer, or photo.
//
// Flag-gated by KAKO_FORM_BUILDER (same as the FV form builder). Company-scoped; the
// erp_forms / erp_form_versions RLS is the backstop.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { emptyFormSchema, resolveFormSchema } from '@/lib/forms/form-schema';
import { buildFormSummaries, isReservedFormCode, type FormSummary, type FormRow, type FormVersionRow } from './forms-library';

type Result = { ok: true } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

/** Admin gate for the Forms Library. forms.admin is seeded in PR-9; until then company
 *  admins reach it via field_verification.admin (the FV-only pack's admin role). */
async function adminCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!hasPermission(ctx, 'field_verification.admin')) return { err: 'err_forbidden' as const, ctx: null };
  if (!FORM_BUILDER_ENABLED()) return { err: 'err_form_builder_disabled' as const, ctx: null };
  return { err: null, ctx };
}

/** A unique-enough company-scoped form code. erp_forms enforces UNIQUE(company_id, code). */
function newFormCode(): string {
  return `form_${crypto.randomUUID().slice(0, 8)}`;
}

/** All custom forms for the company (reserved codes excluded), with latest-version status. */
export async function listForms(): Promise<ResultD<FormSummary[]>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();

  const { data: forms, error: fErr } = await sb.from('erp_forms')
    .select('id, code, name_en, name_ar, is_active, created_at')
    .eq('company_id', ctx.companyId);
  if (fErr) return { ok: false, error: fErr.message };
  const formRows = (forms ?? []) as FormRow[];
  const ids = formRows.filter((f) => !isReservedFormCode(f.code)).map((f) => f.id);
  if (ids.length === 0) return { ok: true, data: [] };

  const { data: versions, error: vErr } = await sb.from('erp_form_versions')
    .select('form_id, version, status').in('form_id', ids);
  if (vErr) return { ok: false, error: vErr.message };

  return { ok: true, data: buildFormSummaries(formRows, (versions ?? []) as FormVersionRow[]) };
}

/** Create a new form (+ an empty v1 draft) and return its id. */
export async function createForm(input: { nameEn: string; nameAr: string }): Promise<ResultD<{ id: string }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const nameEn = (input?.nameEn ?? '').trim();
  const nameAr = (input?.nameAr ?? '').trim();
  if (!nameEn && !nameAr) return { ok: false, error: 'err_name_required' };
  const sb = await createClient();

  const { data: ins, error: fErr } = await sb.from('erp_forms')
    .insert({
      company_id: ctx.companyId, code: newFormCode(),
      name_en: nameEn || nameAr, name_ar: nameAr || nameEn,
      entity: 'customer', is_active: true, created_by: ctx.userId,
    })
    .select('id').single();
  if (fErr) return { ok: false, error: fErr.message };
  const id = (ins as { id: string }).id;

  const { error: vErr } = await sb.from('erp_form_versions')
    .insert({ company_id: ctx.companyId, form_id: id, version: 1, schema: emptyFormSchema(), status: 'draft' });
  if (vErr) return { ok: false, error: vErr.message };

  await logAudit(sb, { action: 'create', entity: 'form', entityId: id, companyId: ctx.companyId });
  revalidatePath('/field-verification/forms');
  return { ok: true, data: { id } };
}

/** Duplicate a form: clone its latest version's schema into a new draft form. */
export async function duplicateForm(formId: string, copySuffix = ' (copy)'): Promise<ResultD<{ id: string }>> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();

  const { data: src, error: sErr } = await sb.from('erp_forms')
    .select('id, code, name_en, name_ar').eq('company_id', ctx.companyId).eq('id', formId).maybeSingle();
  if (sErr) return { ok: false, error: sErr.message };
  if (!src || isReservedFormCode((src as { code: string }).code)) return { ok: false, error: 'err_not_found' };

  const { data: ver } = await sb.from('erp_form_versions')
    .select('schema').eq('form_id', formId).order('version', { ascending: false }).limit(1).maybeSingle();
  const schema = resolveFormSchema((ver as { schema?: unknown } | null)?.schema ?? null);

  const s = src as { name_en: string | null; name_ar: string | null };
  const { data: ins, error: fErr } = await sb.from('erp_forms')
    .insert({
      company_id: ctx.companyId, code: newFormCode(),
      name_en: `${s.name_en ?? ''}${copySuffix}`.trim(), name_ar: `${s.name_ar ?? ''}${copySuffix}`.trim(),
      entity: 'customer', is_active: true, created_by: ctx.userId,
    })
    .select('id').single();
  if (fErr) return { ok: false, error: fErr.message };
  const id = (ins as { id: string }).id;

  const { error: vErr } = await sb.from('erp_form_versions')
    .insert({ company_id: ctx.companyId, form_id: id, version: 1, schema, status: 'draft' });
  if (vErr) return { ok: false, error: vErr.message };

  await logAudit(sb, { action: 'duplicate', entity: 'form', entityId: id, companyId: ctx.companyId, details: { from: formId } });
  revalidatePath('/field-verification/forms');
  return { ok: true, data: { id } };
}

/** Activate / deactivate a form (hides it from My Forms; existing submissions untouched). */
export async function setFormActive(formId: string, active: boolean): Promise<Result> {
  const { err, ctx } = await adminCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();

  const { data: src } = await sb.from('erp_forms')
    .select('code').eq('company_id', ctx.companyId).eq('id', formId).maybeSingle();
  if (!src || isReservedFormCode((src as { code: string }).code)) return { ok: false, error: 'err_not_found' };

  const { error } = await sb.from('erp_forms')
    .update({ is_active: active }).eq('company_id', ctx.companyId).eq('id', formId);
  if (error) return { ok: false, error: error.message };

  await logAudit(sb, { action: active ? 'activate' : 'deactivate', entity: 'form', entityId: formId, companyId: ctx.companyId });
  revalidatePath('/field-verification/forms');
  return { ok: true };
}
