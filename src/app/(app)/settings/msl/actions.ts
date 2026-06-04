'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';

/** ── MSL Matrix Engine — company self-management actions ────────────────────
 *  CRUD for the fully-dynamic MSL: levels, policies, dynamic targeting
 *  conditions (lookup ids) and SKU items. Guarded by `assortment.manage`; every
 *  mutation is audited (erp_audit_logs). RLS scopes all writes to the company;
 *  the erp_set_company_id trigger stamps company_id. No hardcoded dimensions. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'assortment.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

const num = (v: unknown, d = 0): number => { const n = Number(v); return isNaN(n) ? d : n; };
const str = (v: unknown): string => String(v ?? '').trim();
const orNull = (v: unknown): string | null => { const s = str(v); return s === '' ? null : s; };

// ── Levels ──
export async function createMslLevel(input: { code: string; name: string; nameAr?: string; weight?: number; sort?: number }): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!str(input.code) || !str(input.name)) return { ok: false, error: 'code and name required' };
  const supabase = await createClient();
  const { data, error: e } = await supabase.from('erp_msl_levels')
    .insert({ code: str(input.code), name: str(input.name), name_ar: orNull(input.nameAr), weight: num(input.weight, 1), sort: num(input.sort, 0) })
    .select('id').single();
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'create', entity: 'msl_level', entityId: (data as { id: string }).id, details: { code: input.code } });
  revalidatePath('/settings/msl');
  return { ok: true, data: data as { id: string } };
}

export async function deleteMslLevel(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_msl_levels').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'delete', entity: 'msl_level', entityId: id });
  revalidatePath('/settings/msl');
  return { ok: true };
}

// ── Policies ──
export async function createMslPolicy(input: { name: string; nameAr?: string; description?: string; priority?: number; effectiveFrom?: string; effectiveTo?: string }): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!str(input.name)) return { ok: false, error: 'name required' };
  const supabase = await createClient();
  const { data, error: e } = await supabase.from('erp_msl_policies')
    .insert({
      name: str(input.name), name_ar: orNull(input.nameAr), description: orNull(input.description),
      priority: num(input.priority, 0), effective_from: orNull(input.effectiveFrom), effective_to: orNull(input.effectiveTo),
      created_by: ctx.userId,
    })
    .select('id').single();
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'create', entity: 'msl_policy', entityId: (data as { id: string }).id, details: { name: input.name } });
  revalidatePath('/settings/msl');
  return { ok: true, data: data as { id: string } };
}

export async function updateMslPolicy(id: string, patch: { name?: string; priority?: number; effectiveFrom?: string | null; effectiveTo?: string | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const upd: Record<string, unknown> = { updated_by: ctx.userId };
  if (patch.name !== undefined) upd.name = str(patch.name);
  if (patch.priority !== undefined) upd.priority = num(patch.priority, 0);
  if (patch.effectiveFrom !== undefined) upd.effective_from = orNull(patch.effectiveFrom);
  if (patch.effectiveTo !== undefined) upd.effective_to = orNull(patch.effectiveTo);
  const { error: e } = await supabase.from('erp_msl_policies').update(upd).eq('id', id);
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'update', entity: 'msl_policy', entityId: id, details: patch });
  revalidatePath('/settings/msl');
  return { ok: true };
}

export async function setMslPolicyActive(id: string, active: boolean): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_msl_policies').update({ is_active: active, updated_by: ctx.userId }).eq('id', id);
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: active ? 'enable' : 'disable', entity: 'msl_policy', entityId: id });
  revalidatePath('/settings/msl');
  return { ok: true };
}

export async function deleteMslPolicy(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_msl_policies').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'delete', entity: 'msl_policy', entityId: id });
  revalidatePath('/settings/msl');
  return { ok: true };
}

// ── Conditions (dynamic targeting) ──
export async function addMslCondition(policyId: string, lookupId: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!policyId || !lookupId) return { ok: false, error: 'missing ids' };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_msl_policy_conditions').insert({ policy_id: policyId, lookup_id: lookupId });
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'update', entity: 'msl_policy', entityId: policyId, details: { addCondition: lookupId } });
  revalidatePath('/settings/msl');
  return { ok: true };
}

export async function removeMslCondition(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_msl_policy_conditions').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/msl');
  return { ok: true };
}

// ── Items (dynamic SKU assignment) ──
export async function addMslItem(input: { policyId: string; productId: string; levelId?: string | null; weight?: number | null }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.policyId || !input.productId) return { ok: false, error: 'missing ids' };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_msl_policy_items').insert({
    policy_id: input.policyId, product_id: input.productId,
    level_id: orNull(input.levelId), weight: input.weight == null || str(input.weight) === '' ? null : num(input.weight),
  });
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'update', entity: 'msl_policy', entityId: input.policyId, details: { addItem: input.productId } });
  revalidatePath('/settings/msl');
  return { ok: true };
}

export async function removeMslItem(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_msl_policy_items').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/settings/msl');
  return { ok: true };
}
