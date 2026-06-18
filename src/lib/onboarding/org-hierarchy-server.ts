'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { canReparent, isManagedNode, type OrgLevel, type OrgNode } from './org-hierarchy';

/**
 * Configurable Organization Hierarchy — server actions over `erp_org_levels` /
 * `erp_org_nodes`. RLS scopes every row to the caller's company; the action
 * layer additionally requires the people/org capability (`settings.users`, the
 * same gate as the existing Organization screen) and audits every mutation.
 *
 * Backward-compat guardrails (frozen baseline preserved):
 *  - The seed (migration 0342) is the source of truth for structure; nodes that
 *    carry a legacy ref (`legacy_ref_id`) mirror erp_regions/areas/branches/teams
 *    and CANNOT be deleted here — that would orphan branch references. They can
 *    still be renamed, reparented, (de)activated, and given a manager.
 *  - This layer never writes to erp_branches / erp_user_branches, so the frozen
 *    authorization / RLS / reports_to scoping (erp_user_subtree) is untouched.
 */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null as null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'settings.users')) return { ctx: null as null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export interface OrgPerson { id: string; name: string }

export interface OrgStructure {
  levels: OrgLevel[];
  nodes: OrgNode[];
  people: OrgPerson[];
}

function rowToLevel(r: Record<string, unknown>): OrgLevel {
  return {
    id: String(r.id),
    name: String(r.name),
    nameAr: (r.name_ar as string) ?? null,
    depth: Number(r.depth ?? 1),
    sortOrder: Number(r.sort_order ?? 0),
    parentLevelId: (r.parent_level_id as string) ?? null,
    canHoldUsers: Boolean(r.can_hold_users),
    canHoldManager: Boolean(r.can_hold_manager),
    systemKey: (r.system_key as string) ?? null,
  };
}

function rowToNode(r: Record<string, unknown>): OrgNode {
  return {
    id: String(r.id),
    levelId: String(r.level_id),
    parentNodeId: (r.parent_node_id as string) ?? null,
    name: String(r.name),
    nameAr: (r.name_ar as string) ?? null,
    managerUserId: (r.manager_user_id as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    isActive: Boolean(r.is_active),
    legacyRefType: (r.legacy_ref_type as string) ?? null,
    legacyRefId: (r.legacy_ref_id as string) ?? null,
  };
}

/** Load the company's org levels + nodes + assignable people (for managers). */
export async function loadOrgStructure(): Promise<Result<OrgStructure>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const [{ data: levels, error: lErr }, { data: nodes, error: nErr }] = await Promise.all([
    supabase
      .from('erp_org_levels')
      .select('id, name, name_ar, depth, sort_order, parent_level_id, can_hold_users, can_hold_manager, system_key')
      .eq('company_id', ctx.companyId!),
    supabase
      .from('erp_org_nodes')
      .select('id, level_id, parent_node_id, name, name_ar, manager_user_id, sort_order, is_active, legacy_ref_type, legacy_ref_id')
      .eq('company_id', ctx.companyId!),
  ]);
  if (lErr) return { ok: false, error: lErr.message };
  if (nErr) return { ok: false, error: nErr.message };

  // Assignable people = members of the caller's branches (RLS-scoped), deduped.
  const branchIds = ctx.memberships.map((m) => m.branch.id);
  const { data: staff } = await supabase
    .from('erp_user_branches')
    .select('user_id, profile:erp_profiles(id, full_name)')
    .in('branch_id', branchIds.length > 0 ? branchIds : ['']);
  const seen = new Set<string>();
  const people: OrgPerson[] = [];
  for (const r of (staff as unknown[] | null) ?? []) {
    const row = r as { user_id: string; profile: { full_name: string | null } | null };
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    people.push({ id: row.user_id, name: row.profile?.full_name || '—' });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    data: {
      levels: ((levels as Record<string, unknown>[]) ?? []).map(rowToLevel),
      nodes: ((nodes as Record<string, unknown>[]) ?? []).map(rowToNode),
      people,
    },
  };
}

/** Add a new node under a level (optionally under a parent node). */
export async function addOrgNode(input: {
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
    .from('erp_org_nodes')
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

  await logAudit(supabase, { action: 'create', entity: 'org_node', entityId: (data as { id: string }).id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/** Rename a node (English + Arabic). */
export async function renameOrgNode(input: { id: string; name: string; nameAr?: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const name = input.name?.trim();
  if (!input.id) return { ok: false, error: 'missing node' };
  if (!name) return { ok: false, error: 'name_required' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_org_nodes')
    .update({ name, name_ar: input.nameAr?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: 'update', entity: 'org_node', entityId: input.id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true };
}

/** Assign (or clear) a node's manager — "Who's in charge here". */
export async function setOrgNodeManager(input: { id: string; managerUserId: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing node' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_org_nodes')
    .update({ manager_user_id: input.managerUserId, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: 'update', entity: 'org_node_manager', entityId: input.id, details: { manager: input.managerUserId }, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true };
}

/** Move a node under a new parent (or to the top). Cycle-guarded against the
 *  current tree so a node can never become its own descendant. */
export async function moveOrgNode(input: { id: string; parentNodeId: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing node' };

  const supabase = await createClient();
  const { data: nodes, error: selErr } = await supabase
    .from('erp_org_nodes')
    .select('id, level_id, parent_node_id, name, name_ar, manager_user_id, sort_order, is_active, legacy_ref_type, legacy_ref_id')
    .eq('company_id', ctx.companyId!);
  if (selErr) return { ok: false, error: selErr.message };

  const all = ((nodes as Record<string, unknown>[]) ?? []).map(rowToNode);
  if (!all.some((n) => n.id === input.id)) return { ok: false, error: 'not found' };
  if (input.parentNodeId && !all.some((n) => n.id === input.parentNodeId)) return { ok: false, error: 'invalid parent' };
  if (!canReparent(input.id, input.parentNodeId, all)) return { ok: false, error: 'would_create_cycle' };

  const { error: upErr } = await supabase
    .from('erp_org_nodes')
    .update({ parent_node_id: input.parentNodeId, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: 'update', entity: 'org_node_move', entityId: input.id, details: { parent: input.parentNodeId }, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true };
}

/** Activate / deactivate a node (hide it from pickers without deleting). */
export async function setOrgNodeActive(input: { id: string; isActive: boolean }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing node' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_org_nodes')
    .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: input.isActive ? 'enable' : 'disable', entity: 'org_node', entityId: input.id, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true };
}

/** Delete a custom node. Seeded (legacy-ref) nodes are protected — deleting one
 *  would orphan a branch/region reference, so it is refused. */
export async function deleteOrgNode(input: { id: string }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.id) return { ok: false, error: 'missing node' };

  const supabase = await createClient();
  const { data: row, error: selErr } = await supabase
    .from('erp_org_nodes')
    .select('id, legacy_ref_id')
    .eq('id', input.id)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (!row) return { ok: false, error: 'not found' };
  if (isManagedNode({ legacyRefId: (row as { legacy_ref_id: string | null }).legacy_ref_id })) {
    return { ok: false, error: 'protected_seeded_node' };
  }

  const { error: delErr } = await supabase.from('erp_org_nodes').delete().eq('id', input.id);
  if (delErr) return { ok: false, error: delErr.message };

  await logAudit(supabase, { action: 'delete', entity: 'org_node', entityId: input.id, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true };
}

/** Add a custom level (e.g. "Zone") at a given depth. */
export async function addOrgLevel(input: {
  name: string;
  nameAr?: string | null;
  depth: number;
  parentLevelId?: string | null;
  canHoldUsers?: boolean;
}): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: 'name_required' };

  const supabase = await createClient();
  const { data, error: insErr } = await supabase
    .from('erp_org_levels')
    .insert({
      company_id: ctx.companyId!,
      name,
      name_ar: input.nameAr?.trim() || null,
      depth: input.depth ?? 1,
      sort_order: input.depth ?? 1,
      parent_level_id: input.parentLevelId ?? null,
      can_hold_users: input.canHoldUsers ?? false,
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  await logAudit(supabase, { action: 'create', entity: 'org_level', entityId: (data as { id: string }).id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/** Rename a level (e.g. relabel "Region" → "Governorate"). */
export async function renameOrgLevel(input: { id: string; name: string; nameAr?: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const name = input.name?.trim();
  if (!input.id) return { ok: false, error: 'missing level' };
  if (!name) return { ok: false, error: 'name_required' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_org_levels')
    .update({ name, name_ar: input.nameAr?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, { action: 'update', entity: 'org_level', entityId: input.id, details: { name }, companyId: ctx.companyId });
  revalidatePath('/settings/organization-structure');
  return { ok: true };
}
