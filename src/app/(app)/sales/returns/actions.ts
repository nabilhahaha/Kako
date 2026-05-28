'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

interface ReturnLineInput {
  product_id: string;
  quantity: number;
  unit_price: number;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function createReturn(input: {
  branch_id: string;
  customer_id: string;
  reason?: string;
  notes?: string;
  lines: ReturnLineInput[];
}): Promise<ActionResult<{ id: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  if (!input.branch_id) return { ok: false, error: 'الفرع مطلوب.' };
  if (!input.customer_id) return { ok: false, error: 'العميل مطلوب.' };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'أضف بنداً واحداً على الأقل.' };

  const supabase = await createClient();
  const total = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));

  const { data: number, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: 'return',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: ret, error: retErr } = await supabase
    .from('erp_sales_returns')
    .insert({
      branch_id: input.branch_id,
      customer_id: input.customer_id,
      return_number: number as string,
      status: 'draft',
      total_amount: total,
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (retErr) return { ok: false, error: friendlyDbError(retErr) };

  const { error: linesErr } = await supabase.from('erp_sales_return_lines').insert(
    lines.map((l) => ({
      return_id: ret.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: round2(l.quantity * l.unit_price),
    })),
  );
  if (linesErr) {
    await supabase.from('erp_sales_returns').delete().eq('id', ret.id);
    return { ok: false, error: friendlyDbError(linesErr) };
  }

  revalidatePath('/sales/returns');
  return { ok: true, data: { id: ret.id } };
}

/**
 * Complete a return. Atomic via RPC: restock (return_in), post the
 * Sales-Returns/AR journal, and lower the customer balance in one tx.
 */
export async function completeReturn(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_complete_sales_return', { p_return_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/sales/returns');
  revalidatePath('/customers');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function cancelReturn(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_sales_returns')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['draft', 'approved']);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/returns');
  return { ok: true };
}
