'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { validateSubmission, type RuleField } from '@/lib/erp/form-rules';
import { applyFormEffect } from '@/lib/erp/form-effects';
import { captureScore, captureKindFor, CAPTURE_KINDS, type CaptureKind } from '@/lib/erp/field-capture';
import { getT } from '@/lib/i18n/server';

interface FieldRow { key: string; type: string; required: boolean; options: unknown | null; visibility: unknown | null; validation: unknown | null }

/** ── submitFieldCapture (FE-4a) ─────────────────────────────────────────────
 *  An in-visit Builder capture: validate (shared rules engine), record the
 *  submission against the customer (subject = record), run the form effect
 *  (emit_fact → raw fact), then link it via erp_fe_captures with a simple score.
 *  field_ops-gated; runs under the rep's RLS. */
export async function submitFieldCapture(input: {
  formId: string; customerId: string; visitId?: string | null; kind?: CaptureKind; values: Record<string, unknown>; scoreField?: string;
}): Promise<ActionResult<{ captureId: string; submissionId: string }>> {
  const { t } = await getT();
  const ctx = await getUserContext();
  const companyId = ctx?.company?.id;
  if (!ctx || !companyId || !ctx.modules.includes('field_ops')) return { ok: false, error: t('formsRun.errors.unauthorized') };

  const supabase = await createClient();
  const { data: formRow } = await supabase.from('erp_form_definitions').select('id, key, status').eq('id', input.formId).maybeSingle();
  const form = formRow as { id: string; key: string; status: string } | null;
  if (!form) return { ok: false, error: t('formsRun.errors.notFound') };
  if (form.status !== 'active') return { ok: false, error: t('formsRun.errors.notActive') };

  // server-side validation (authoritative)
  const { data: fieldRows } = await supabase.from('erp_form_fields').select('key, type, required, options, visibility, validation').eq('form_id', input.formId);
  const ruleFields: RuleField[] = ((fieldRows as FieldRow[]) ?? []).map((f) => ({
    key: f.key, type: f.type as RuleField['type'], required: f.required,
    options: f.options as RuleField['options'], visibility: f.visibility as RuleField['visibility'], validation: f.validation as RuleField['validation'],
  }));
  if (Object.keys(validateSubmission(ruleFields, input.values)).length > 0) return { ok: false, error: t('formsRun.errors.validation') };

  // record the submission against the customer (auto-approved capture)
  const { data: subRow, error: insErr } = await supabase
    .from('erp_form_submissions')
    .insert({ company_id: companyId, form_id: input.formId, record_id: input.customerId, submitter: ctx.userId, values: input.values, status: 'approved' })
    .select('id').single();
  if (insErr) return { ok: false, error: friendlyDbError(insErr) };
  const submissionId = (subRow as { id: string }).id;

  // run the form effect (emit_fact → raw fact); never fatal
  await applyFormEffect(supabase, submissionId);

  const kind = input.kind && (CAPTURE_KINDS as readonly string[]).includes(input.kind) ? input.kind : captureKindFor(form.key);
  const { data: capRow, error: capErr } = await supabase
    .from('erp_fe_captures')
    .insert({ company_id: companyId, visit_id: input.visitId ?? null, customer_id: input.customerId, form_id: input.formId, submission_id: submissionId, kind, score: captureScore(input.values, input.scoreField), created_by: ctx.userId })
    .select('id').single();
  if (capErr) return { ok: false, error: friendlyDbError(capErr) };

  revalidatePath('/field/route');
  revalidatePath(`/field/customers/${input.customerId}`);
  return { ok: true, data: { captureId: (capRow as { id: string }).id, submissionId } };
}
