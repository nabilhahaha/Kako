'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { isKnownEntity } from '@/lib/erp/entities';
import {
  CUSTOM_FIELD_TYPES, slugifyFieldKey,
  type CustomFieldType, type CustomFieldOption, type CustomFieldValidation, type VisibilityRule,
} from '@/lib/erp/custom-fields';

/** ── Custom Fields — definition management (gated: settings.custom_fields) ──
 *  Definitions are company config; RLS backstops with company-admin/owner, and
 *  every change is audit-logged by a DB trigger (migration 0087). */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'settings.custom_fields')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export interface CustomFieldInput {
  entity: string;
  key?: string;
  label_ar: string;
  label_en?: string;
  type: CustomFieldType;
  required?: boolean;
  options?: CustomFieldOption[];
  validation?: CustomFieldValidation;
  visibility?: VisibilityRule | null;
  sort?: number;
}

function clean(input: CustomFieldInput) {
  const needsOptions = input.type === 'select' || input.type === 'multiselect';
  return {
    entity: input.entity,
    label_ar: (input.label_ar || '').trim(),
    label_en: (input.label_en || '').trim() || null,
    type: input.type,
    required: Boolean(input.required),
    options: needsOptions ? (input.options ?? []).filter((o) => o.value?.trim()) : [],
    validation: input.validation ?? {},
    visibility: input.visibility ?? null,
    sort: Number.isFinite(input.sort) ? Number(input.sort) : 0,
  };
}

export async function createCustomField(input: CustomFieldInput): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!isKnownEntity(input.entity)) return { ok: false, error: 'unknown entity' };
  if (!CUSTOM_FIELD_TYPES.includes(input.type)) return { ok: false, error: 'invalid type' };
  const c = clean(input);
  if (!c.label_ar) return { ok: false, error: 'label required' };
  const key = slugifyFieldKey(input.key || input.label_en || input.label_ar);
  if (!key) return { ok: false, error: 'invalid key' };

  const supabase = await createClient();
  const { data, error: e } = await supabase
    .from('erp_custom_fields')
    .insert({ ...c, key, created_by: ctx.userId })
    .select('id')
    .single();
  if (e) return { ok: false, error: e.code === '23505' ? 'a field with this key already exists' : e.message };
  revalidatePath('/settings/custom-fields');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function updateCustomField(id: string, input: CustomFieldInput): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!CUSTOM_FIELD_TYPES.includes(input.type)) return { ok: false, error: 'invalid type' };
  const c = clean(input);
  if (!c.label_ar) return { ok: false, error: 'label required' };
  const supabase = await createClient();
  const { error: e } = await supabase
    .from('erp_custom_fields')
    .update({ ...c, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/custom-fields');
  return { ok: true };
}

export async function setCustomFieldActive(id: string, isActive: boolean): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase
    .from('erp_custom_fields')
    .update({ is_active: isActive, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/custom-fields');
  return { ok: true };
}

export async function deleteCustomField(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_custom_fields').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/custom-fields');
  return { ok: true };
}
