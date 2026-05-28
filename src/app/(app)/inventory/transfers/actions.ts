'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

interface TransferLineInput {
  product_id: string;
  quantity: number;
}

export async function createTransfer(input: {
  branch_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  notes?: string;
  lines: TransferLineInput[];
}): Promise<ActionResult<{ id: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  if (!input.from_warehouse_id || !input.to_warehouse_id)
    return { ok: false, error: 'اختر المخزن المصدر والمخزن الوجهة.' };
  if (input.from_warehouse_id === input.to_warehouse_id)
    return { ok: false, error: 'لا يمكن التحويل لنفس المخزن.' };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'أضف بنداً واحداً على الأقل.' };

  const supabase = await createClient();
  const { data: trNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: 'transfer',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: order, error: orderErr } = await supabase
    .from('erp_transfer_orders')
    .insert({
      transfer_number: trNumber as string,
      from_warehouse_id: input.from_warehouse_id,
      to_warehouse_id: input.to_warehouse_id,
      status: 'draft',
      notes: input.notes?.trim() || null,
      created_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (orderErr) return { ok: false, error: friendlyDbError(orderErr) };

  const { error: linesErr } = await supabase.from('erp_transfer_order_lines').insert(
    lines.map((l) => ({
      transfer_order_id: order.id,
      product_id: l.product_id,
      quantity: l.quantity,
    })),
  );
  if (linesErr) {
    await supabase.from('erp_transfer_orders').delete().eq('id', order.id);
    return { ok: false, error: friendlyDbError(linesErr) };
  }

  revalidatePath('/inventory/transfers');
  return { ok: true, data: { id: order.id } };
}

/**
 * Complete a transfer. Atomic via RPC: paired transfer_out / transfer_in
 * movements and status update in one transaction.
 */
export async function completeTransfer(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_complete_transfer', { p_transfer_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/inventory/transfers');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function cancelTransfer(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_transfer_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['draft', 'in_transit']);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/transfers');
  return { ok: true };
}
