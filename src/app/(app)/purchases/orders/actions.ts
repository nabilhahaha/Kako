'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';

interface POInput {
  branch_id: string;
  supplier_id: string;
  notes?: string;
  lines: LineInput[];
}

export async function createPurchaseOrder(input: POInput): Promise<ActionResult<{ id: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  if (!input.branch_id) return { ok: false, error: 'الفرع مطلوب.' };
  if (!input.supplier_id) return { ok: false, error: 'المورد مطلوب.' };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'أضف بنداً واحداً على الأقل.' };

  const supabase = await createClient();
  const totals = computeTotals(lines);

  const { data: poNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: 'purchase_order',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: po, error: poErr } = await supabase
    .from('erp_purchase_orders')
    .insert({
      branch_id: input.branch_id,
      supplier_id: input.supplier_id,
      po_number: poNumber as string,
      status: 'draft',
      total_amount: totals.total_amount,
      tax_amount: totals.tax_amount,
      net_amount: totals.net_amount,
      notes: input.notes?.trim() || null,
      created_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (poErr) return { ok: false, error: friendlyDbError(poErr) };

  const lineRows = lines.map((l) => {
    const c = computeLine(l);
    return {
      purchase_order_id: po.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: c.net,
    };
  });
  const { error: linesErr } = await supabase.from('erp_purchase_order_lines').insert(lineRows);
  if (linesErr) {
    await supabase.from('erp_purchase_orders').delete().eq('id', po.id);
    return { ok: false, error: friendlyDbError(linesErr) };
  }

  revalidatePath('/purchases/orders');
  return { ok: true, data: { id: po.id } };
}

export async function cancelPurchaseOrder(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_purchase_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['draft', 'sent']);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/purchases/orders');
  return { ok: true };
}

/**
 * Receive a PO in full into a warehouse. Atomic via RPC: creates the goods
 * receipt (+lines, which add stock), posts the Inventory/AP journal, and
 * raises the supplier balance — all in one transaction.
 */
export async function receivePurchaseOrder(
  poId: string,
  warehouseId: string,
  details?: Array<{ product_id: string; batch_number?: string; expiry_date?: string }>,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (!warehouseId) return { ok: false, error: 'اختر المخزن المستلِم.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_receive_purchase_order', {
    p_po_id: poId,
    p_warehouse_id: warehouseId,
    p_details: (details ?? []).map((d) => ({
      product_id: d.product_id,
      batch_number: d.batch_number ?? null,
      expiry_date: d.expiry_date || null,
    })),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/purchases/orders');
  revalidatePath('/suppliers');
  revalidatePath('/warehouses');
  return { ok: true };
}
