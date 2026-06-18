'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { canReparent, isManagedProductNode, type ProductLevel, type ProductNode } from './product-hierarchy';

/**
 * Configurable Product Hierarchy — server actions over `erp_product_levels` /
 * `erp_product_nodes`. RLS scopes every row to the caller's company; the action
 * layer requires the product capability (`product.edit`) and audits writes.
 *
 * Backward-compat guardrails: nodes seeded from erp_product_categories carry a
 * legacy ref and CANNOT be deleted (that would orphan a category reference);
 * this layer never writes to erp_product_categories / erp_products_catalog, so
 * the canonical catalog is untouched.
 */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null as null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'product.edit')) return { ctx: null as null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export interface ProductStructure {
  levels: ProductLevel[];
  nodes: ProductNode[];
}

function rowToLevel(r: Record<string, unknown>): ProductLevel {
  return {
    id: String(r.id),
    name: String(r.name),
    nameAr: (r.name_ar as string) ?? null,
    depth: Number(r.depth ?? 1),
    sortOrder: Number(r.sort_order ?? 0),
    parentLevelId: (r.parent_level_id as string) ?? null,
    systemKey: (r.system_key as string) ?? null,
  };
}

function rowToNode(r: Record<string, unknown>): ProductNode {
  return {
    id: String(r.id),
    levelId: String(r.level_id),
    parentNodeId: (r.parent_node_id as string) ?? null,
    name: String(r.name),
    nameAr: (r.name_ar as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
    legacyRefType: (r.legacy_ref_type as string) ?? null,
    legacyRefId: (r.legacy_ref_id as string) ?? null,
  };
}

export async function loadProductStructure(): Promise<Result<ProductStructure>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const [{ data: levels, error: lErr }, { data: nodes, error: nErr }] = await Promise.all([
    supabase
      .from('erp_product_levels')
      .select('id, name, name_ar, depth, sort_order, parent_level_id, system_key')
      .eq('company_id', ctx.companyId!),
    supabase
      .from('erp_product_nodes')
      .select('id, level_id, parent_node_id, name, name_ar, sort_order, is_active, legacy_ref_type, legacy_ref_id')
      .eq('company_id', ctx.companyId!),
  ]);
  if (lErr) return { ok: false, error: lErr.message };
  if (nErr) return { ok: false, error: nErr.message };

  return {
    ok: true,
    data: {
      levels: ((levels as Record<string, unknown>[]) ?? []).map(rowToLevel),
      nodes: ((nodes as Record<string, unknown>[]) ?? []).map(rowToNode),
    },
  };
}

export async function addProductNode(input: {
  levelId: string;
  parentNodeId?: string | null;
  name: string;
  nameAr?: string | null;
}): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const name = input.name?.trim();
  if (!input.levelId) return { ok: false, error: 'missing level' };
  if (!name) return { ok: false, error: 'name_required' };

  const supabase = await createClient();
  const { data, error: insErr } = await supabase
    .from('erp_product_nodes')
    .insert({
      company_id: ctx.companyId!,
      level_id: input.levelId,
      parent_node_id: input.parentNodeId ?? null,
      name,
      name_ar: input.nameAr?.trim() || null,
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  await logAudit(supabase, { action: 'create', entity: 'product_node', entityId: (data as { id: string }).id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/product-structure');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function renameProductNode(input: { id: string; name: string; nameAr?: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const name = input.name?.trim();
  if (!input.id) return { ok: false, error: 'missing node' };
  if (!name) return { ok: false, error: 'name_required' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_product_nodes')
    .update({ name, name_ar: input.nameAr?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: 'update', entity: 'product_node', entityId: input.id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/product-structure');
  return { ok: true };
}

export async function moveProductNode(input: { id: string; parentNodeId: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing node' };

  const supabase = await createClient();
  const { data: nodes, error: selErr } = await supabase
    .from('erp_product_nodes')
    .select('id, level_id, parent_node_id, name, name_ar, sort_order, is_active, legacy_ref_type, legacy_ref_id')
    .eq('company_id', ctx.companyId!);
  if (selErr) return { ok: false, error: selErr.message };

  const all = ((nodes as Record<string, unknown>[]) ?? []).map(rowToNode);
  if (!all.some((n) => n.id === input.id)) return { ok: false, error: 'not found' };
  if (input.parentNodeId && !all.some((n) => n.id === input.parentNodeId)) return { ok: false, error: 'invalid parent' };
  if (!canReparent(input.id, input.parentNodeId, all)) return { ok: false, error: 'would_create_cycle' };

  const { error: upErr } = await supabase
    .from('erp_product_nodes')
    .update({ parent_node_id: input.parentNodeId, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: 'update', entity: 'product_node_move', entityId: input.id, details: { parent: input.parentNodeId }, companyId: ctx.companyId });
  revalidatePath('/settings/product-structure');
  return { ok: true };
}

export async function setProductNodeActive(input: { id: string; isActive: boolean }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing node' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_product_nodes')
    .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: input.isActive ? 'enable' : 'disable', entity: 'product_node', entityId: input.id, companyId: ctx.companyId });
  revalidatePath('/settings/product-structure');
  return { ok: true };
}

export async function deleteProductNode(input: { id: string }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing node' };

  const supabase = await createClient();
  const { data: row, error: selErr } = await supabase
    .from('erp_product_nodes')
    .select('id, legacy_ref_id')
    .eq('id', input.id)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (!row) return { ok: false, error: 'not found' };
  if (isManagedProductNode({ legacyRefId: (row as { legacy_ref_id: string | null }).legacy_ref_id })) {
    return { ok: false, error: 'protected_seeded_node' };
  }

  const { error: delErr } = await supabase.from('erp_product_nodes').delete().eq('id', input.id);
  if (delErr) return { ok: false, error: delErr.message };

  await logAudit(supabase, { action: 'delete', entity: 'product_node', entityId: input.id, companyId: ctx.companyId });
  revalidatePath('/settings/product-structure');
  return { ok: true };
}

export async function addProductLevel(input: {
  name: string;
  nameAr?: string | null;
  depth: number;
  parentLevelId?: string | null;
}): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'name_required' };

  const supabase = await createClient();
  const { data, error: insErr } = await supabase
    .from('erp_product_levels')
    .insert({
      company_id: ctx.companyId!,
      name,
      name_ar: input.nameAr?.trim() || null,
      depth: input.depth ?? 1,
      sort_order: input.depth ?? 1,
      parent_level_id: input.parentLevelId ?? null,
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  await logAudit(supabase, { action: 'create', entity: 'product_level', entityId: (data as { id: string }).id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/product-structure');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function renameProductLevel(input: { id: string; name: string; nameAr?: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const name = input.name?.trim();
  if (!input.id) return { ok: false, error: 'missing level' };
  if (!name) return { ok: false, error: 'name_required' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_product_levels')
    .update({ name, name_ar: input.nameAr?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: 'update', entity: 'product_level', entityId: input.id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/product-structure');
  return { ok: true };
}
