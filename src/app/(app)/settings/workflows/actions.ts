'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';

/** ── Workflow Builder Lite — definition + step management ──────────────────
 *  Gated on workflow.manage; RLS backstops with company-admin/owner. Companies
 *  build their own definitions (global templates are owner-managed). */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'workflow.manage')) return { ctx: null, error: 'unauthorized' as const };
  if (!ctx.companyId) return { ctx: null, error: 'no company' as const };
  return { ctx, error: null };
}

export async function createDefinition(
  key: string, entity: string, nameAr: string, nameEn: string,
): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const k = key.trim(); const e = entity.trim();
  if (!k || !e) return { ok: false, error: 'key and entity required' };
  const supabase = await createClient();
  const { data, error: err } = await supabase
    .from('erp_workflow_definitions')
    .insert({ company_id: ctx.companyId, key: k, entity: e, name_ar: nameAr.trim() || k, name_en: nameEn.trim() || null })
    .select('id').single();
  if (err) return { ok: false, error: err.code === '23505' ? 'a definition with this key exists' : err.message };
  revalidatePath('/settings/workflows');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function addStep(input: {
  definitionId: string; stepNo: number; nameAr: string; approverType: string; approverRef?: string;
  mode: string; requiredApprovals: number; thresholdAmount?: number | null;
}): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!['company_admin', 'user', 'role'].includes(input.approverType)) return { ok: false, error: 'invalid approver type' };
  if (!['sequential', 'parallel'].includes(input.mode)) return { ok: false, error: 'invalid mode' };
  const condition = input.thresholdAmount != null && Number.isFinite(input.thresholdAmount)
    ? { when: 'amount', op: 'gt', value: String(input.thresholdAmount) }
    : null;
  const supabase = await createClient();
  const { error: err } = await supabase.from('erp_workflow_steps').insert({
    definition_id: input.definitionId,
    step_no: Math.max(1, Math.floor(input.stepNo || 1)),
    name_ar: input.nameAr.trim() || null,
    approver_type: input.approverType,
    approver_ref: input.approverRef?.trim() || null,
    mode: input.mode,
    required_approvals: Math.max(1, Math.floor(input.requiredApprovals || 1)),
    condition,
  });
  if (err) return { ok: false, error: err.code === '23505' ? 'step number already exists' : err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

export async function deleteStep(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: err } = await supabase.from('erp_workflow_steps').delete().eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

export async function setDefinitionActive(id: string, isActive: boolean): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: err } = await supabase
    .from('erp_workflow_definitions').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

export async function deleteDefinition(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: err } = await supabase.from('erp_workflow_definitions').delete().eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}
