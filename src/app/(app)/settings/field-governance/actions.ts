'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { isDefaultProtected } from '@/lib/erp/field-governance-server';
import {
  configLockoutViolation,
  accessLockoutViolation,
  type AccessLevel,
  type SubjectType,
} from '@/lib/erp/field-governance';

/**
 * Dynamic Field Governance — write API (DFG-1). Company admins configure the
 * per-field layout + per-subject access. Every change is gated, lockout-checked,
 * and audited with before/after values. Tenant isolation by RLS (company_id set
 * by trigger). Field-governance config reuses the settings.custom_fields right.
 */

async function guard(): Promise<
  | { ok: true; companyId: string; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false; error: string }
> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !hasPermission(ctx, 'settings.custom_fields')) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId, supabase: await createClient(), userId: ctx.userId };
}

interface ConfigPatch {
  section?: string | null;
  sort?: number;
  is_active?: boolean;
  is_sensitive?: boolean;
  is_protected?: boolean;
  default_access?: AccessLevel;
  inheritance?: 'none' | 'inherit' | 'inherit_locked';
  condition?: unknown;
  label_ar?: string | null;
  label_en?: string | null;
}

/** Upsert a field's company configuration (layout/meta). */
export async function setFieldConfig(
  entity: string,
  fieldKey: string,
  source: 'core' | 'custom',
  patch: ConfigPatch,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;

  const { data: existing } = await supabase
    .from('erp_field_config')
    .select('*')
    .eq('entity', entity)
    .eq('field_key', fieldKey)
    .maybeSingle();
  const before = existing as Record<string, unknown> | null;

  // Admin lockout: a protected field can't be globally disabled or hidden.
  const isProtected = patch.is_protected ?? (before?.is_protected as boolean | undefined) ?? isDefaultProtected(entity, fieldKey);
  const violation = configLockoutViolation(isProtected, { is_active: patch.is_active, default_access: patch.default_access });
  if (violation) return { ok: false, error: violation };

  const row = { company_id: companyId, entity, field_key: fieldKey, source, ...patch, updated_by: userId };
  const { error } = await supabase
    .from('erp_field_config')
    .upsert(row, { onConflict: 'company_id,entity,field_key' });
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: before ? 'update' : 'create',
    entity: 'field_config',
    entityId: `${entity}:${fieldKey}`,
    details: { before, after: { ...patch } },
    companyId,
  });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Set (or change) a role/permission's access to a field. */
export async function setFieldAccess(
  entity: string,
  fieldKey: string,
  subjectType: SubjectType,
  subjectKey: string,
  access: AccessLevel,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;

  // Admin lockout: can't hide a field from admin roles (or strip edit on protected).
  const { data: cfg } = await supabase
    .from('erp_field_config').select('is_protected').eq('entity', entity).eq('field_key', fieldKey).maybeSingle();
  const isProtected = (cfg as { is_protected?: boolean } | null)?.is_protected ?? isDefaultProtected(entity, fieldKey);
  const violation = accessLockoutViolation(isProtected, subjectType, subjectKey, access);
  if (violation) return { ok: false, error: violation };

  const { data: existing } = await supabase
    .from('erp_field_access')
    .select('access')
    .eq('entity', entity).eq('field_key', fieldKey).eq('subject_type', subjectType).eq('subject_key', subjectKey)
    .maybeSingle();
  const before = existing as { access: string } | null;

  const { error } = await supabase
    .from('erp_field_access')
    .upsert(
      { company_id: companyId, entity, field_key: fieldKey, subject_type: subjectType, subject_key: subjectKey, access, updated_by: userId },
      { onConflict: 'company_id,entity,field_key,subject_type,subject_key' },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: before ? 'update' : 'create',
    entity: 'field_access',
    entityId: `${entity}:${fieldKey}`,
    details: { subject_type: subjectType, subject_key: subjectKey, before: before?.access ?? null, after: access },
    companyId,
  });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

interface SectionPatch {
  label_ar?: string | null;
  label_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  icon?: string | null;
  collapsible?: boolean;
  default_collapsed?: boolean;
  sort?: number;
}

/** Create / update a section's presentation metadata. */
export async function setFieldSection(entity: string, key: string, patch: SectionPatch): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;
  const { data: existing } = await supabase
    .from('erp_field_sections').select('*').eq('entity', entity).eq('key', key).maybeSingle();
  const before = existing as Record<string, unknown> | null;
  const { error } = await supabase
    .from('erp_field_sections')
    .upsert({ company_id: companyId, entity, key, ...patch, updated_by: userId }, { onConflict: 'company_id,entity,key' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: before ? 'update' : 'create', entity: 'field_section', entityId: `${entity}:${key}`,
    details: { before, after: { ...patch } }, companyId,
  });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Delete a section's presentation metadata (fields keep their `section` key). */
export async function deleteFieldSection(entity: string, key: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;
  const { error } = await supabase.from('erp_field_sections').delete().eq('entity', entity).eq('key', key);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'delete', entity: 'field_section', entityId: `${entity}:${key}`, details: null, companyId });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Persist a new section order (sort = position). */
export async function reorderFieldSections(entity: string, orderedKeys: string[]): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;
  for (let i = 0; i < orderedKeys.length; i++) {
    const { error } = await supabase
      .from('erp_field_sections')
      .upsert({ company_id: companyId, entity, key: orderedKeys[i], sort: i, updated_by: userId }, { onConflict: 'company_id,entity,key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Persist a new field order (sort = position) for the given fields. */
export async function reorderFields(entity: string, ordered: Array<{ key: string; source: 'core' | 'custom' }>): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;
  for (let i = 0; i < ordered.length; i++) {
    const { error } = await supabase
      .from('erp_field_config')
      .upsert({ company_id: companyId, entity, field_key: ordered[i].key, source: ordered[i].source, sort: i, updated_by: userId }, { onConflict: 'company_id,entity,field_key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Remove a subject's explicit access (revert to the field default). */
export async function clearFieldAccess(
  entity: string,
  fieldKey: string,
  subjectType: SubjectType,
  subjectKey: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;
  const { error } = await supabase
    .from('erp_field_access')
    .delete()
    .eq('entity', entity).eq('field_key', fieldKey).eq('subject_type', subjectType).eq('subject_key', subjectKey);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: 'delete', entity: 'field_access', entityId: `${entity}:${fieldKey}`,
    details: { subject_type: subjectType, subject_key: subjectKey }, companyId,
  });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}
