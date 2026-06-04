'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { isKnownEntity } from '@/lib/erp/entities';

/** ── Import Engine: saved mapping templates ────────────────────────────────
 *  Save / Clone / Share / set Default a column→field mapping, per entity, per
 *  company. RLS scopes everything to the tenant; the default-setter goes through
 *  a guarded SECURITY DEFINER RPC (it must clear a colleague's prior default). */

export interface MappingTemplate {
  id: string;
  name: string;
  mapping: Record<string, string>;
  isShared: boolean;
  isDefault: boolean;
  mine: boolean;
}
interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

type Row = {
  id: string; name: string; mapping: Record<string, string> | null;
  is_shared: boolean; is_default: boolean; created_by: string | null;
};
const toTemplate = (r: Row, userId: string): MappingTemplate => ({
  id: r.id, name: r.name, mapping: r.mapping ?? {},
  isShared: r.is_shared, isDefault: r.is_default, mine: r.created_by === userId,
});

/** Templates the user can see for an entity (own + shared), default first. */
export async function listMappingTemplates(entityKey: string): Promise<Result<MappingTemplate[]>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data, error: e } = await supabase
    .from('erp_import_mappings')
    .select('id, name, mapping, is_shared, is_default, created_by')
    .eq('target_entity', entityKey)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });
  if (e) return { ok: false, error: e.message };
  return { ok: true, data: (data as Row[] ?? []).map((r) => toTemplate(r, ctx.userId)) };
}

export async function saveMappingTemplate(
  entityKey: string, name: string, mapping: Record<string, string>, isShared = false,
): Promise<Result<MappingTemplate>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!isKnownEntity(entityKey)) return { ok: false, error: 'unknown entity' };
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'name required' };
  const supabase = await createClient();
  const { data, error: e } = await supabase
    .from('erp_import_mappings')
    .insert({ target_entity: entityKey, name: clean, mapping, is_shared: isShared, created_by: ctx.userId })
    .select('id, name, mapping, is_shared, is_default, created_by')
    .single();
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/import');
  return { ok: true, data: toTemplate(data as Row, ctx.userId) };
}

export async function cloneMappingTemplate(id: string, newName: string): Promise<Result<MappingTemplate>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const clean = newName.trim();
  if (!clean) return { ok: false, error: 'name required' };
  const supabase = await createClient();
  // RLS ensures we can only read templates we're allowed to see.
  const { data: src, error: e1 } = await supabase
    .from('erp_import_mappings')
    .select('target_entity, mapping')
    .eq('id', id)
    .single();
  if (e1 || !src) return { ok: false, error: e1?.message ?? 'template not found' };
  const s = src as { target_entity: string; mapping: Record<string, string> | null };
  const { data, error: e2 } = await supabase
    .from('erp_import_mappings')
    .insert({ target_entity: s.target_entity, name: clean, mapping: s.mapping ?? {}, is_shared: false, created_by: ctx.userId })
    .select('id, name, mapping, is_shared, is_default, created_by')
    .single();
  if (e2) return { ok: false, error: e2.message };
  revalidatePath('/settings/import');
  return { ok: true, data: toTemplate(data as Row, ctx.userId) };
}

export async function shareMappingTemplate(id: string, isShared: boolean): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase
    .from('erp_import_mappings')
    .update({ is_shared: isShared, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/import');
  return { ok: true };
}

/** Set (or clear, with id=null) the company default for an entity. */
export async function setDefaultMappingTemplate(id: string | null): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_set_default_mapping', { p_id: id });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/import');
  return { ok: true };
}

export async function deleteMappingTemplate(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_import_mappings').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/import');
  return { ok: true };
}
