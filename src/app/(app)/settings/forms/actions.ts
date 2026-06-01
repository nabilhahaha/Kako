'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

async function adminCtx() {
  const ctx = await getUserContext();
  const companyId = ctx?.company?.id;
  const isAdmin = ctx?.memberships.some((m) => m.role === 'admin');
  return { ctx, companyId, ok: Boolean(ctx && companyId && isAdmin) };
}

/** Create a new (empty) company form. */
export async function createForm(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { t } = await getT();
  const { ctx, companyId, ok } = await adminCtx();
  if (!ok || !ctx || !companyId) return { ok: false, error: t('forms.errors.adminOnly') };
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('forms.errors.nameRequired') };
  const key = slug(String(formData.get('key') || '') || name);
  if (!key) return { ok: false, error: t('forms.errors.nameRequired') };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_form_definitions')
    .insert({ company_id: companyId, key, name_en: name, name_ar: String(formData.get('name_ar') || '').trim() || null, created_by: ctx.userId })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.code === '23505' ? t('forms.errors.keyDup') : friendlyDbError(error) };
  revalidatePath('/settings/forms');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/** Clone an existing form (global template or company form) into a new company form. */
export async function cloneForm(sourceId: string, newName: string): Promise<ActionResult<{ id: string }>> {
  const { t } = await getT();
  const { ctx, companyId, ok } = await adminCtx();
  if (!ok || !ctx || !companyId) return { ok: false, error: t('forms.errors.adminOnly') };
  if (!newName.trim()) return { ok: false, error: t('forms.errors.nameRequired') };

  const supabase = await createClient();
  const { data: src } = await supabase
    .from('erp_form_definitions')
    .select('name_ar, module, target_entity, workflow_key, effect')
    .eq('id', sourceId)
    .single();
  const key = `${slug(newName)}_${Math.random().toString(36).slice(2, 6)}`;
  const { data: created, error } = await supabase
    .from('erp_form_definitions')
    .insert({
      company_id: companyId, key, name_en: newName.trim(),
      name_ar: (src as { name_ar?: string } | null)?.name_ar ?? null,
      module: (src as { module?: string } | null)?.module ?? null,
      target_entity: (src as { target_entity?: string } | null)?.target_entity ?? null,
      workflow_key: (src as { workflow_key?: string } | null)?.workflow_key ?? null,
      effect: (src as { effect?: unknown } | null)?.effect ?? { type: 'record_only' },
      created_by: ctx.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  const newId = (created as { id: string }).id;

  const { data: fields } = await supabase
    .from('erp_form_fields')
    .select('key, label_ar, label_en, help_ar, help_en, type, section, sort_order, required, options, validation, visibility, default_value')
    .eq('form_id', sourceId);
  const rows = ((fields as Record<string, unknown>[]) ?? []).map((f) => ({ ...f, form_id: newId }));
  if (rows.length > 0) await supabase.from('erp_form_fields').insert(rows);

  revalidatePath('/settings/forms');
  return { ok: true, data: { id: newId } };
}

/** Delete a company form (and its fields). */
export async function deleteForm(id: string): Promise<ActionResult> {
  const { t } = await getT();
  const { ok } = await adminCtx();
  if (!ok) return { ok: false, error: t('forms.errors.adminOnly') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_form_definitions').delete().eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/settings/forms');
  return { ok: true };
}
