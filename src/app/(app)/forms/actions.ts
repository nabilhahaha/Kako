'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { validateSubmission, type RuleField } from '@/lib/erp/form-rules';
import { applyFormEffect } from '@/lib/erp/form-effects';
import { getT } from '@/lib/i18n/server';

interface FieldRow {
  key: string; type: string; required: boolean;
  options: unknown | null; visibility: unknown | null; validation: unknown | null;
}

/** ── Form submission processing (B5) ───────────────────────────────────────
 *  Members submit an active form. Values are validated server-side via the
 *  shared rules engine, the submission is recorded, then:
 *    • bound to a form_submission workflow (with steps) → start the workflow and
 *      let the approval drive the effect (B6) on completion; OR
 *    • no workflow → auto-approve and apply the effect immediately.
 *  Everything runs under the submitter's RLS (permission-aware) and is audited
 *  (submission insert trigger + explicit effect audit). */
export async function submitForm(input: {
  formId: string; values: Record<string, unknown>; recordId?: string;
}): Promise<ActionResult<{ status: 'pending' | 'approved'; submissionId: string }>> {
  const { t } = await getT();
  const ctx = await getUserContext();
  const companyId = ctx?.company?.id;
  if (!ctx || !companyId) return { ok: false, error: t('formsRun.errors.unauthorized') };

  const supabase = await createClient();
  const { data: formRow } = await supabase
    .from('erp_form_definitions')
    .select('id, company_id, workflow_key, status')
    .eq('id', input.formId)
    .maybeSingle();
  const form = formRow as { id: string; company_id: string | null; workflow_key: string | null; status: string } | null;
  if (!form) return { ok: false, error: t('formsRun.errors.notFound') };
  if (form.status !== 'active') return { ok: false, error: t('formsRun.errors.notActive') };

  // Server-side validation (mirror of the client gate; authoritative).
  const { data: fieldRows } = await supabase
    .from('erp_form_fields')
    .select('key, type, required, options, visibility, validation')
    .eq('form_id', input.formId);
  const ruleFields: RuleField[] = ((fieldRows as FieldRow[]) ?? []).map((f) => ({
    key: f.key, type: f.type as RuleField['type'], required: f.required,
    options: f.options as RuleField['options'], visibility: f.visibility as RuleField['visibility'], validation: f.validation as RuleField['validation'],
  }));
  const errors = validateSubmission(ruleFields, input.values);
  if (Object.keys(errors).length > 0) return { ok: false, error: t('formsRun.errors.validation') };

  // Record the submission (pending).
  const { data: subRow, error: insErr } = await supabase
    .from('erp_form_submissions')
    .insert({ company_id: companyId, form_id: input.formId, record_id: input.recordId?.trim() || null, submitter: ctx.userId, values: input.values, status: 'pending' })
    .select('id').single();
  if (insErr) return { ok: false, error: friendlyDbError(insErr) };
  const submissionId = (subRow as { id: string }).id;

  // Is there a usable approval workflow (bound, form_submission entity, ≥1 step)?
  let hasWorkflow = false;
  if (form.workflow_key) {
    const { data: def } = await supabase
      .from('erp_workflow_definitions')
      .select('id, is_active')
      .eq('key', form.workflow_key).eq('entity', 'form_submission').eq('company_id', companyId)
      .maybeSingle();
    const d = def as { id: string; is_active: boolean } | null;
    if (d?.id && d.is_active) {
      const { count } = await supabase
        .from('erp_workflow_steps').select('id', { count: 'exact', head: true })
        .eq('definition_id', d.id);
      hasWorkflow = (count ?? 0) > 0;
    }
  }

  if (hasWorkflow && form.workflow_key) {
    const { data: inst, error: wfErr } = await supabase.rpc('erp_workflow_start', {
      p_key: form.workflow_key, p_entity: 'form_submission', p_record_id: submissionId, p_context: input.values,
    });
    if (wfErr) return { ok: false, error: friendlyDbError(wfErr) };
    await supabase.from('erp_form_submissions').update({ workflow_instance_id: inst as string }).eq('id', submissionId);
    revalidatePath('/forms');
    revalidatePath('/requests');
    return { ok: true, data: { status: 'pending', submissionId } };
  }

  // No workflow → auto-approve and apply the effect now (as the submitter).
  await supabase.from('erp_form_submissions').update({ status: 'approved' }).eq('id', submissionId);
  await applyFormEffect(supabase, submissionId);
  revalidatePath('/forms');
  return { ok: true, data: { status: 'approved', submissionId } };
}
