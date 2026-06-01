'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import type { ConditionOp } from '@/lib/erp/form-rules';
import { getT } from '@/lib/i18n/server';

const APPROVER_TYPES = ['company_admin', 'role', 'user', 'manager', 'department_head', 'route_owner', 'account_owner'];

async function requireAdmin() {
  const ctx = await getUserContext();
  const companyId = ctx?.company?.id;
  const isAdmin = ctx?.memberships.some((m) => m.role === 'admin');
  return ctx && companyId && isAdmin ? { ctx, companyId } : null;
}

/** Ensure the form has a dedicated, company-scoped approval workflow
 *  (entity = 'form_submission') and that the form is bound to it. */
export async function ensureFormWorkflow(formId: string): Promise<ActionResult<{ key: string; definitionId: string }>> {
  const { t } = await getT();
  const g = await requireAdmin();
  if (!g) return { ok: false, error: t('forms.errors.adminOnly') };
  const supabase = await createClient();
  const { data: form } = await supabase.from('erp_form_definitions').select('key, name_en, name_ar, workflow_key, company_id').eq('id', formId).single();
  const f = form as { key: string; name_en: string | null; name_ar: string | null; workflow_key: string | null; company_id: string | null } | null;
  if (!f) return { ok: false, error: t('forms.errors.nameRequired') };

  // already bound to a company form-submission workflow?
  if (f.workflow_key) {
    const { data: existing } = await supabase.from('erp_workflow_definitions').select('id').eq('key', f.workflow_key).eq('entity', 'form_submission').eq('company_id', g.companyId).maybeSingle();
    if (existing) return { ok: true, data: { key: f.workflow_key, definitionId: (existing as { id: string }).id } };
  }

  const key = `form_${f.key}_${Math.random().toString(36).slice(2, 6)}`;
  const { data: def, error } = await supabase
    .from('erp_workflow_definitions')
    .insert({ company_id: g.companyId, key, entity: 'form_submission', scope: 'company', name_en: f.name_en, name_ar: f.name_ar, category: 'forms' })
    .select('id').single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  await supabase.from('erp_form_definitions').update({ workflow_key: key }).eq('id', formId);
  revalidatePath(`/settings/forms/${formId}`);
  return { ok: true, data: { key, definitionId: (def as { id: string }).id } };
}

export async function addStep(input: {
  formId: string; definitionId: string; approverType: string; approverRef?: string;
  mode: 'sequential' | 'parallel'; requiredApprovals: number;
  condWhen?: string; condOp?: ConditionOp; condValue?: string;
}): Promise<ActionResult> {
  const { t } = await getT();
  if (!(await requireAdmin())) return { ok: false, error: t('forms.errors.adminOnly') };
  if (!APPROVER_TYPES.includes(input.approverType)) return { ok: false, error: t('forms.wf.invalidApprover') };
  const supabase = await createClient();
  const { data: max } = await supabase.from('erp_workflow_steps').select('step_no').eq('definition_id', input.definitionId).order('step_no', { ascending: false }).limit(1);
  const next = ((max as { step_no: number }[] | null)?.[0]?.step_no ?? 0) + 1;
  const condition = input.condWhen?.trim() ? { when: input.condWhen.trim(), op: input.condOp ?? 'eq', value: input.condValue ?? '' } : null;
  const ref = ['role', 'user'].includes(input.approverType) ? (input.approverRef?.trim() || null) : null;
  const { error } = await supabase.from('erp_workflow_steps').insert({
    definition_id: input.definitionId, step_no: next, approver_type: input.approverType, approver_ref: ref,
    mode: input.mode, required_approvals: Math.max(1, Math.floor(input.requiredApprovals || 1)), condition,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/settings/forms/${input.formId}`);
  return { ok: true };
}

export async function updateStep(input: {
  formId: string; stepId: string; approverType: string; approverRef?: string;
  mode: 'sequential' | 'parallel'; requiredApprovals: number;
  condWhen?: string; condOp?: ConditionOp; condValue?: string;
}): Promise<ActionResult> {
  const { t } = await getT();
  if (!(await requireAdmin())) return { ok: false, error: t('forms.errors.adminOnly') };
  if (!APPROVER_TYPES.includes(input.approverType)) return { ok: false, error: t('forms.wf.invalidApprover') };
  const supabase = await createClient();
  const condition = input.condWhen?.trim() ? { when: input.condWhen.trim(), op: input.condOp ?? 'eq', value: input.condValue ?? '' } : null;
  const ref = ['role', 'user'].includes(input.approverType) ? (input.approverRef?.trim() || null) : null;
  const { error } = await supabase.from('erp_workflow_steps').update({
    approver_type: input.approverType, approver_ref: ref, mode: input.mode,
    required_approvals: Math.max(1, Math.floor(input.requiredApprovals || 1)), condition,
  }).eq('id', input.stepId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/settings/forms/${input.formId}`);
  return { ok: true };
}

export async function deleteStep(formId: string, stepId: string): Promise<ActionResult> {
  const { t } = await getT();
  if (!(await requireAdmin())) return { ok: false, error: t('forms.errors.adminOnly') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_workflow_steps').delete().eq('id', stepId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/settings/forms/${formId}`);
  return { ok: true };
}

export async function reorderSteps(formId: string, orderedIds: string[]): Promise<ActionResult> {
  const { t } = await getT();
  if (!(await requireAdmin())) return { ok: false, error: t('forms.errors.adminOnly') };
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('erp_workflow_steps').update({ step_no: i + 1 }).eq('id', orderedIds[i]);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath(`/settings/forms/${formId}`);
  return { ok: true };
}
