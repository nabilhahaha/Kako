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
  type SectionAccessLevel,
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

/** (P5) Set (or change) a role/permission/capability's access to a whole SECTION.
 *  A section with no rows is visible to everyone (cutover-safe); once it has rows
 *  it is restricted to subjects granted 'view'. Admins always see every section,
 *  so no lockout guard is needed. Reuses the settings.custom_fields right. */
export async function setFieldSectionAccess(
  entity: string,
  sectionKey: string,
  subjectType: SubjectType,
  subjectKey: string,
  access: SectionAccessLevel,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;

  const { data: existing } = await supabase
    .from('erp_field_section_access')
    .select('access')
    .eq('entity', entity).eq('section_key', sectionKey).eq('subject_type', subjectType).eq('subject_key', subjectKey)
    .maybeSingle();
  const before = existing as { access: string } | null;

  const { error } = await supabase
    .from('erp_field_section_access')
    .upsert(
      { company_id: companyId, entity, section_key: sectionKey, subject_type: subjectType, subject_key: subjectKey, access, updated_by: userId },
      { onConflict: 'company_id,entity,section_key,subject_type,subject_key' },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: before ? 'update' : 'create',
    entity: 'field_section_access',
    entityId: `${entity}:${sectionKey}`,
    details: { subject_type: subjectType, subject_key: subjectKey, before: before?.access ?? null, after: access },
    companyId,
  });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** (P5) Remove a section access rule (revert that subject to ungoverned). When the
 *  last rule on a section is removed the section is visible to everyone again. */
export async function removeFieldSectionAccess(
  entity: string,
  sectionKey: string,
  subjectType: SubjectType,
  subjectKey: string,
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;

  const { error } = await supabase
    .from('erp_field_section_access')
    .delete()
    .eq('entity', entity).eq('section_key', sectionKey).eq('subject_type', subjectType).eq('subject_key', subjectKey);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'delete',
    entity: 'field_section_access',
    entityId: `${entity}:${sectionKey}`,
    details: { subject_type: subjectType, subject_key: subjectKey },
    companyId,
  });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Bulk-apply a config patch (hide/show, required, editable/read-only, active)
 *  to many fields at once. Lockout-checked per field; one audit entry. */
export async function bulkSetFieldConfig(
  entity: string,
  items: Array<{ key: string; source: 'core' | 'custom' }>,
  patch: { is_active?: boolean; default_access?: AccessLevel },
): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;
  if (items.length === 0) return { ok: true };

  const { data: existing } = await supabase
    .from('erp_field_config').select('field_key, is_protected').eq('entity', entity);
  const protMap = new Map<string, boolean>((existing ?? []).map((r) => [(r as { field_key: string }).field_key, (r as { is_protected: boolean }).is_protected]));

  const rows = items.map((it) => ({ company_id: companyId, entity, field_key: it.key, source: it.source, ...patch, updated_by: userId }));
  for (const it of items) {
    const isProtected = protMap.get(it.key) ?? isDefaultProtected(entity, it.key);
    if (configLockoutViolation(isProtected, patch)) return { ok: false, error: 'protected_field_cannot_be_hidden' };
  }
  const { error } = await supabase.from('erp_field_config').upsert(rows, { onConflict: 'company_id,entity,field_key' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'update', entity: 'field_config', entityId: `${entity}:*`, details: { bulk: items.map((i) => i.key), patch }, companyId });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Reset an entity to company defaults: remove all config/access/section rows so
 *  the engine reverts to the registry (today's behavior). Audited. */
export async function resetEntityGovernance(entity: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;
  for (const table of ['erp_field_access', 'erp_field_config', 'erp_field_sections']) {
    const { error } = await supabase.from(table).delete().eq('entity', entity);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  await logAudit(supabase, { action: 'delete', entity: 'field_config', entityId: `${entity}:reset`, details: { reset: true }, companyId });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Export an entity's full governance config as portable JSON. */
export async function exportFieldGovernance(entity: string): Promise<ActionResult<{ json: string }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase } = g;
  const strip = (rows: Array<Record<string, unknown>> | null) =>
    (rows ?? []).map((r) => {
      const o = { ...r };
      for (const k of ['id', 'company_id', 'created_at', 'updated_at', 'created_by', 'updated_by']) delete o[k];
      return o;
    });
  const [{ data: config }, { data: access }, { data: sections }] = await Promise.all([
    supabase.from('erp_field_config').select('*').eq('entity', entity),
    supabase.from('erp_field_access').select('*').eq('entity', entity),
    supabase.from('erp_field_sections').select('*').eq('entity', entity),
  ]);
  const payload = { entity, version: 1, config: strip(config), access: strip(access), sections: strip(sections) };
  return { ok: true, data: { json: JSON.stringify(payload, null, 2) } };
}

/** Import a governance config (replaces the entity's current config). Lockout-
 *  checked; audited as one entry. */
export async function importFieldGovernance(entity: string, json: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;
  let parsed: { config?: Array<Record<string, unknown>>; access?: Array<Record<string, unknown>>; sections?: Array<Record<string, unknown>> };
  try { parsed = JSON.parse(json); } catch { return { ok: false, error: 'invalid_json' }; }

  for (const c of parsed.config ?? []) {
    const isProtected = (c.is_protected as boolean | undefined) ?? isDefaultProtected(entity, c.field_key as string);
    if (configLockoutViolation(isProtected, { is_active: c.is_active as boolean, default_access: c.default_access as AccessLevel })) {
      return { ok: false, error: 'protected_field_cannot_be_hidden' };
    }
  }
  const stamp = (r: Record<string, unknown>) => ({ ...r, entity, company_id: companyId, updated_by: userId });
  if (parsed.sections?.length) {
    const { error } = await supabase.from('erp_field_sections').upsert(parsed.sections.map(stamp), { onConflict: 'company_id,entity,key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  if (parsed.config?.length) {
    const { error } = await supabase.from('erp_field_config').upsert(parsed.config.map(stamp), { onConflict: 'company_id,entity,field_key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  if (parsed.access?.length) {
    const { error } = await supabase.from('erp_field_access').upsert(parsed.access.map(stamp), { onConflict: 'company_id,entity,field_key,subject_type,subject_key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  await logAudit(supabase, { action: 'create', entity: 'field_config', entityId: `${entity}:import`, details: { imported: { config: parsed.config?.length ?? 0, access: parsed.access?.length ?? 0, sections: parsed.sections?.length ?? 0 } }, companyId });
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

// ── DFG-2c (Tier A): copy, templates, history ───────────────────────────────

const STRIP_KEYS = ['id', 'company_id', 'created_at', 'updated_at', 'created_by', 'updated_by'];
function stripRows(rows: Array<Record<string, unknown>> | null): Array<Record<string, unknown>> {
  return (rows ?? []).map((r) => {
    const o = { ...r };
    for (const k of STRIP_KEYS) delete o[k];
    return o;
  });
}

interface Snapshot { config: Array<Record<string, unknown>>; access: Array<Record<string, unknown>>; sections: Array<Record<string, unknown>> }

/** Read an entity's governance as a portable snapshot. companyId scopes the read
 *  (used by the Platform-Owner cross-company copy). */
async function readSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entity: string,
  companyId?: string,
): Promise<Snapshot> {
  const q = (tbl: string) => {
    const base = supabase.from(tbl).select('*').eq('entity', entity);
    return companyId ? base.eq('company_id', companyId) : base;
  };
  const [{ data: config }, { data: access }, { data: sections }] = await Promise.all([q('erp_field_config'), q('erp_field_access'), q('erp_field_sections')]);
  return { config: stripRows(config), access: stripRows(access), sections: stripRows(sections) };
}

/** Write a snapshot onto a target entity/company (upsert). Lockout-checked. */
async function applySnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entity: string,
  companyId: string,
  snap: Snapshot,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const c of snap.config) {
    const isProtected = (c.is_protected as boolean | undefined) ?? isDefaultProtected(entity, c.field_key as string);
    if (configLockoutViolation(isProtected, { is_active: c.is_active as boolean, default_access: c.default_access as AccessLevel })) {
      return { ok: false, error: 'protected_field_cannot_be_hidden' };
    }
  }
  const stamp = (r: Record<string, unknown>) => ({ ...r, entity, company_id: companyId, updated_by: userId });
  if (snap.sections.length) {
    const { error } = await supabase.from('erp_field_sections').upsert(snap.sections.map(stamp), { onConflict: 'company_id,entity,key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  if (snap.config.length) {
    const { error } = await supabase.from('erp_field_config').upsert(snap.config.map(stamp), { onConflict: 'company_id,entity,field_key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  if (snap.access.length) {
    const { error } = await supabase.from('erp_field_access').upsert(snap.access.map(stamp), { onConflict: 'company_id,entity,field_key,subject_type,subject_key' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  return { ok: true };
}

/** Copy one entity's governance config onto another entity (same company). */
export async function copyEntityConfig(srcEntity: string, dstEntity: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  if (srcEntity === dstEntity) return { ok: false, error: 'same_entity' };
  const snap = await readSnapshot(g.supabase, srcEntity);
  const res = await applySnapshot(g.supabase, dstEntity, g.companyId, snap, g.userId);
  if (!res.ok) return res;
  await logAudit(g.supabase, { action: 'create', entity: 'field_config', entityId: `${dstEntity}:copy`, details: { from_entity: srcEntity }, companyId: g.companyId });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Platform-Owner only: copy an entity's governance from one company to another. */
export async function copyCompanyConfig(srcCompanyId: string, dstCompanyId: string, entity: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.isPlatformOwner) return { ok: false, error: 'platform_owner_only' };
  const supabase = await createClient();
  const snap = await readSnapshot(supabase, entity, srcCompanyId);
  const res = await applySnapshot(supabase, entity, dstCompanyId, snap, ctx.userId);
  if (!res.ok) return res;
  await logAudit(supabase, { action: 'create', entity: 'field_config', entityId: `${entity}:copy_company`, details: { from_company: srcCompanyId, to_company: dstCompanyId }, companyId: dstCompanyId });
  return { ok: true };
}

/** Save the current entity governance as a reusable template (global = Platform Owner). */
export async function saveAsTemplate(entity: string, name: string, isGlobal: boolean): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !hasPermission(ctx, 'settings.custom_fields')) return { ok: false, error: 'unauthorized' };
  if (isGlobal && !ctx.isPlatformOwner) return { ok: false, error: 'platform_owner_only' };
  if (!name.trim()) return { ok: false, error: 'name_required' };
  const supabase = await createClient();
  const snap = await readSnapshot(supabase, entity);
  const { error: insErr } = await supabase.from('erp_field_templates').insert({
    company_id: isGlobal ? null : ctx.companyId, name: name.trim(), scope_entity: entity, snapshot: snap, is_global: isGlobal, created_by: ctx.userId,
  });
  if (insErr) return { ok: false, error: friendlyDbError(insErr) };
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Apply a saved template onto the current entity. */
export async function applyTemplate(templateId: string, entity: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { data: tpl } = await g.supabase.from('erp_field_templates').select('snapshot').eq('id', templateId).maybeSingle();
  const snap = (tpl as { snapshot?: Snapshot } | null)?.snapshot;
  if (!snap) return { ok: false, error: 'template_not_found' };
  const res = await applySnapshot(g.supabase, entity, g.companyId, snap, g.userId);
  if (!res.ok) return res;
  await logAudit(g.supabase, { action: 'create', entity: 'field_config', entityId: `${entity}:template`, details: { template: templateId }, companyId: g.companyId });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

interface HistoryRow { actor: string | null; action: string; field: string; details: unknown; at: string }

/** Recent field-governance change history for an entity (from the audit log). */
export async function getFieldGovernanceHistory(entity: string): Promise<ActionResult<{ rows: HistoryRow[] }>> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { data } = await g.supabase
    .from('erp_audit_logs')
    .select('actor_email, action, entity, entity_id, details, created_at')
    .in('entity', ['field_config', 'field_access', 'field_section'])
    .like('entity_id', `${entity}:%`)
    .order('created_at', { ascending: false })
    .limit(50);
  const rows: HistoryRow[] = (data ?? []).map((r) => {
    const x = r as { actor_email: string | null; action: string; entity_id: string; details: unknown; created_at: string };
    return { actor: x.actor_email, action: x.action, field: x.entity_id, details: x.details, at: x.created_at };
  });
  return { ok: true, data: { rows } };
}

// ── DFG-2d (Tier B): versioning, draft/publish, rollback ────────────────────

/** Publish the current draft (live tables) as a new published version. The prior
 *  published version is archived (non-destructive). The resolver serves the
 *  published snapshot from here on. */
export async function publishFieldGovernance(entity: string, label?: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;
  const snap = await readSnapshot(supabase, entity);

  const { data: maxRow } = await supabase
    .from('erp_field_config_versions').select('version_no').eq('entity', entity)
    .order('version_no', { ascending: false }).limit(1).maybeSingle();
  const nextNo = ((maxRow as { version_no?: number } | null)?.version_no ?? 0) + 1;

  // Archive the current published (keeps one-published invariant).
  await supabase.from('erp_field_config_versions').update({ status: 'archived' }).eq('entity', entity).eq('status', 'published');

  const { error } = await supabase.from('erp_field_config_versions').insert({
    company_id: companyId, entity, version_no: nextNo, status: 'published',
    snapshot: snap, label: label?.trim() || null, created_by: userId, published_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'create', entity: 'field_config', entityId: `${entity}:publish`, details: { version_no: nextNo, label: label ?? null }, companyId });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}

/** Non-destructive rollback: republish an older version's snapshot as a NEW
 *  published version and restore it into the live draft. Prior versions retained. */
export async function rollbackToVersion(entity: string, versionId: string): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;

  const { data: ver } = await supabase
    .from('erp_field_config_versions').select('version_no, snapshot').eq('id', versionId).eq('entity', entity).maybeSingle();
  const row = ver as { version_no: number; snapshot: Snapshot } | null;
  if (!row) return { ok: false, error: 'version_not_found' };

  // Restore the snapshot into the live draft (clear then apply → exact match).
  for (const table of ['erp_field_access', 'erp_field_config', 'erp_field_sections']) {
    const { error } = await supabase.from(table).delete().eq('entity', entity);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  const applied = await applySnapshot(supabase, entity, companyId, row.snapshot, userId);
  if (!applied.ok) return applied;

  // Publish it as a new version (non-destructive — old versions kept).
  const { data: maxRow } = await supabase
    .from('erp_field_config_versions').select('version_no').eq('entity', entity)
    .order('version_no', { ascending: false }).limit(1).maybeSingle();
  const nextNo = ((maxRow as { version_no?: number } | null)?.version_no ?? 0) + 1;
  await supabase.from('erp_field_config_versions').update({ status: 'archived' }).eq('entity', entity).eq('status', 'published');
  const { error } = await supabase.from('erp_field_config_versions').insert({
    company_id: companyId, entity, version_no: nextNo, status: 'published',
    snapshot: row.snapshot, label: `rollback → v${row.version_no}`, created_by: userId, published_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'update', entity: 'field_config', entityId: `${entity}:rollback`, details: { to_version: row.version_no, new_version: nextNo }, companyId });
  revalidatePath('/settings/field-governance');
  return { ok: true };
}
