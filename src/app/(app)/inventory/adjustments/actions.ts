'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/**
 * Post a manual stock adjustment. Small adjustments post immediately; large ones
 * (|qty × cost| ≥ the company threshold) are queued for manager approval. The
 * RPC writes the stock movement, audit log, and adjustment record atomically.
 */
export async function postAdjustment(
  warehouseId: string,
  productId: string,
  qty: number,
  reason: string | null,
): Promise<ActionResult<{ status: string }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (!warehouseId || !productId) return { ok: false, error: 'اختر المخزن والصنف.' };
  if (!qty || Number.isNaN(qty)) return { ok: false, error: 'أدخل كمية تسوية غير صفرية.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_post_stock_adjustment', {
    p_warehouse_id: warehouseId,
    p_product_id: productId,
    p_qty: qty,
    p_reason: reason,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/adjustments');
  revalidatePath('/inventory');
  return { ok: true, data: { status: (data as { status?: string })?.status ?? 'posted' } };
}

export async function approveAdjustment(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_approve_stock_adjustment', { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/adjustments');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function rejectAdjustment(id: string, reason: string | null): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_reject_stock_adjustment', { p_id: id, p_reason: reason });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/adjustments');
  return { ok: true };
}

export async function reverseAdjustment(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_reverse_stock_adjustment', { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/adjustments');
  revalidatePath('/inventory');
  return { ok: true };
}
