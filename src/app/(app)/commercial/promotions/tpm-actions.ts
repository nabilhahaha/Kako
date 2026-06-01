'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** ── TPM (CP) — promotion management actions (TPM-2) ────────────────────────
 *  Thin wrappers over the scope/permission-checked erp_tpm_* RPCs. */
async function ok() { const ctx = await getUserContext(); return !!ctx?.company?.id; }

export interface PromotionInput {
  id?: string | null; name: string; promo_type: string; starts_on: string; ends_on: string;
  budget?: number | null; cost?: number | null; target_value?: number | null; target_qty?: number | null; params?: unknown; notes?: string | null;
}

export async function savePromotion(p: PromotionInput): Promise<ActionResult<{ id: string }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_tpm_promotion_save', {
    p_name: p.name, p_type: p.promo_type, p_starts: p.starts_on, p_ends: p.ends_on,
    p_budget: p.budget ?? null, p_cost: p.cost ?? null, p_params: p.params ?? {}, p_notes: p.notes ?? null,
    p_id: p.id ?? null, p_target_value: p.target_value ?? null, p_target_qty: p.target_qty ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/promotions');
  return { ok: true, data: data as { id: string } };
}

export async function addTarget(promo: string, dimType: string, dimRef: string | null): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_tpm_target_add', { p_promo: promo, p_dim_type: dimType, p_dim_id: null, p_dim_ref: dimRef });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/commercial/promotions/${promo}`);
  return { ok: true };
}

export async function removeTarget(promo: string, dimType: string, dimId: string | null): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_tpm_target_remove', { p_promo: promo, p_dim_type: dimType, p_dim_id: dimId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/commercial/promotions/${promo}`);
  return { ok: true };
}

export async function setPromotionStatus(id: string, status: string): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_tpm_set_status', { p_id: id, p_status: status });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/commercial/promotions'); revalidatePath(`/commercial/promotions/${id}`);
  return { ok: true };
}

export async function refreshPerformance(id: string): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_tpm_refresh_performance', { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/commercial/promotions/${id}`);
  return { ok: true };
}
