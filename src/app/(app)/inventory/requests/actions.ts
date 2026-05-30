'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

interface RequestInput {
  branch_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  notes?: string;
  lines: Array<{ product_id: string; quantity: number }>;
}

/** Rep raises a stock-load request from a source warehouse into a van. */
export async function createStockRequest(input: RequestInput): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!input.from_warehouse_id || !input.to_warehouse_id)
    return { ok: false, error: t('inventory.errorSelectSourceAndVan') };
  if (input.from_warehouse_id === input.to_warehouse_id)
    return { ok: false, error: t('inventory.errorSameSourceDest') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('inventory.errorAtLeastOneItem') };

  const supabase = await createClient();
  const { data: number, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: 'van_load',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: req, error: rErr } = await supabase
    .from('erp_stock_requests')
    .insert({
      request_number: number as string,
      branch_id: input.branch_id,
      from_warehouse_id: input.from_warehouse_id,
      to_warehouse_id: input.to_warehouse_id,
      status: 'pending',
      notes: input.notes?.trim() || null,
      requested_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (rErr) return { ok: false, error: friendlyDbError(rErr) };

  const { error: lErr } = await supabase.from('erp_stock_request_lines').insert(
    lines.map((l) => ({ request_id: req.id, product_id: l.product_id, quantity: l.quantity })),
  );
  if (lErr) {
    await supabase.from('erp_stock_requests').delete().eq('id', req.id);
    return { ok: false, error: friendlyDbError(lErr) };
  }

  revalidatePath('/inventory/requests');
  return { ok: true };
}

/** Warehouse keeper / manager approves: moves stock to the van (atomic RPC). */
export async function approveStockRequest(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_approve_stock_request', { p_request_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/requests');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function rejectStockRequest(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_stock_requests')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/requests');
  return { ok: true };
}

export async function cancelStockRequest(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_stock_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/requests');
  return { ok: true };
}
