'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { FIELD_TYPES, type FieldType, type FormEffect } from '@/lib/erp/form-builder';
import { WHITELISTED_EFFECTS } from '@/lib/erp/form-effects';
import type { Condition, Validation } from '@/lib/erp/form-rules';
import { getT } from '@/lib/i18n/server';

async function requireAdmin(): Promise<string | null> {
  const ctx = await getUserContext();
  const isAdmin = ctx?.memberships.some((m) => m.role === 'admin');
  return ctx && ctx.company?.id && isAdmin ? null : 'adminOnly';
}

function rev(id: string) {
  revalidatePath(`/settings/forms/${id}`);
}

/** Update the form header + workflow binding + status + effect. */
export async function updateForm(input: {
  id: string; nameEn: string; nameAr?: string; module?: string; targetEntity?: string;
  workflowKey?: string; status: 'draft' | 'active' | 'archived'; effect?: FormEffect;
}): Promise<ActionResult> {
  const { t } = await getT();
  if (await requireAdmin()) return { ok: false, error: t('forms.errors.adminOnly') };
  if (!input.nameEn.trim()) return { ok: false, error: t('forms.errors.nameRequired') };
  // Guard: only whitelisted effects may be persisted (higher-risk effects deferred).
  const effect: FormEffect = input.effect && (WHITELISTED_EFFECTS as readonly string[]).includes(input.effect.type)
    ? input.effect : { type: 'record_only' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_form_definitions').update({
    name_en: input.nameEn.trim(), name_ar: input.nameAr?.trim() || null,
    module: input.module?.trim() || null, target_entity: input.targetEntity?.trim() || null,
    workflow_key: input.workflowKey?.trim() || null, status: input.status, effect, updated_at: new Date().toISOString(),
  }).eq('id', input.id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  rev(input.id);
  return { ok: true };
}

/** Create or update a field. */
export async function upsertField(input: {
  formId: string; id?: string; key: string; type: string; labelEn: string; labelAr?: string;
  helpEn?: string; helpAr?: string; section?: string; required: boolean;
  options?: { value: string; label: string }[]; defaultValue?: string;
  visibility?: Condition | null; validation?: Validation | null;
}): Promise<ActionResult> {
  const { t } = await getT();
  if (await requireAdmin()) return { ok: false, error: t('forms.errors.adminOnly') };
  if (!input.key.trim()) return { ok: false, error: t('forms.errors.fieldKeyRequired') };
  if (!FIELD_TYPES.includes(input.type as FieldType)) return { ok: false, error: t('forms.errors.invalidType') };

  const supabase = await createClient();
  const row = {
    key: input.key.trim(), type: input.type, label_en: input.labelEn.trim() || input.key,
    label_ar: input.labelAr?.trim() || null, help_en: input.helpEn?.trim() || null, help_ar: input.helpAr?.trim() || null,
    section: input.section?.trim() || null, required: input.required,
    options: input.options && input.options.length > 0 ? input.options : null,
    default_value: input.defaultValue?.trim() || null,
    visibility: input.visibility ?? null,
    validation: input.validation ?? null,
  };
  if (input.id) {
    const { error } = await supabase.from('erp_form_fields').update(row).eq('id', input.id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { data: max } = await supabase.from('erp_form_fields').select('sort_order').eq('form_id', input.formId).order('sort_order', { ascending: false }).limit(1);
    const next = ((max as { sort_order: number }[] | null)?.[0]?.sort_order ?? 0) + 1;
    const { error } = await supabase.from('erp_form_fields').insert({ ...row, form_id: input.formId, sort_order: next });
    if (error) return { ok: false, error: error.code === '23505' ? t('forms.errors.fieldKeyDup') : friendlyDbError(error) };
  }
  rev(input.formId);
  return { ok: true };
}

export async function deleteField(formId: string, fieldId: string): Promise<ActionResult> {
  const { t } = await getT();
  if (await requireAdmin()) return { ok: false, error: t('forms.errors.adminOnly') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_form_fields').delete().eq('id', fieldId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  rev(formId);
  return { ok: true };
}

/** Persist a new field order (array of field ids in display order). */
export async function reorderFields(formId: string, orderedIds: string[]): Promise<ActionResult> {
  const { t } = await getT();
  if (await requireAdmin()) return { ok: false, error: t('forms.errors.adminOnly') };
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase.from('erp_form_fields').update({ sort_order: i + 1 }).eq('id', orderedIds[i]).eq('form_id', formId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  rev(formId);
  return { ok: true };
}
