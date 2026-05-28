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
 * Complete a transfer: move stock out of the source and into the destination
 * warehouse via paired stock movements (transfer_out / transfer_in).
 */
export async function completeTransfer(id: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { data: order, error: oErr } = await supabase
    .from('erp_transfer_orders')
    .select('*')
    .eq('id', id)
    .single();
  if (oErr || !order) return { ok: false, error: 'أمر التحويل غير موجود.' };
  if (order.status === 'received') return { ok: false, error: 'تم تنفيذ هذا التحويل بالفعل.' };
  if (order.status === 'cancelled') return { ok: false, error: 'أمر التحويل ملغي.' };

  const { data: lines } = await supabase
    .from('erp_transfer_order_lines')
    .select('*')
    .eq('transfer_order_id', id);
  if (!lines || lines.length === 0) return { ok: false, error: 'أمر التحويل بلا بنود.' };

  const movements = lines.flatMap((l) => [
    {
      movement_type: 'transfer_out' as const,
      warehouse_id: order.from_warehouse_id,
      product_id: l.product_id,
      quantity: -Math.abs(Number(l.quantity)),
      reference_type: 'transfer',
      reference_id: id,
      notes: `تحويل صادر: ${order.transfer_number}`,
      created_by: ctx!.userId,
    },
    {
      movement_type: 'transfer_in' as const,
      warehouse_id: order.to_warehouse_id,
      product_id: l.product_id,
      quantity: Math.abs(Number(l.quantity)),
      reference_type: 'transfer',
      reference_id: id,
      notes: `تحويل وارد: ${order.transfer_number}`,
      created_by: ctx!.userId,
    },
  ]);

  const { error: movErr } = await supabase.from('erp_stock_movements').insert(movements);
  if (movErr) return { ok: false, error: friendlyDbError(movErr) };

  for (const l of lines) {
    await supabase
      .from('erp_transfer_order_lines')
      .update({ received_qty: l.quantity })
      .eq('id', l.id);
  }
  await supabase.from('erp_transfer_orders').update({ status: 'received' }).eq('id', id);

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
