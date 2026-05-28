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
 * Receive a PO in full into a warehouse: creates a goods receipt (+lines),
 * which auto-adds stock via the receipt-line trigger. Then posts the
 * Inventory/AP journal and raises the supplier's payable balance.
 */
export async function receivePurchaseOrder(
  poId: string,
  warehouseId: string,
): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (!warehouseId) return { ok: false, error: 'اختر المخزن المستلِم.' };

  const supabase = await createClient();
  const { data: po, error: poErr } = await supabase
    .from('erp_purchase_orders')
    .select('*')
    .eq('id', poId)
    .single();
  if (poErr || !po) return { ok: false, error: 'أمر الشراء غير موجود.' };
  if (po.status === 'received') return { ok: false, error: 'تم استلام هذا الأمر بالفعل.' };
  if (po.status === 'cancelled') return { ok: false, error: 'أمر الشراء ملغي.' };

  const { data: lines } = await supabase
    .from('erp_purchase_order_lines')
    .select('*')
    .eq('purchase_order_id', poId);
  if (!lines || lines.length === 0) return { ok: false, error: 'أمر الشراء بلا بنود.' };

  // Goods receipt header
  const { data: grNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: po.branch_id,
    p_seq_type: 'goods_receipt',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: receipt, error: grErr } = await supabase
    .from('erp_goods_receipts')
    .insert({
      purchase_order_id: poId,
      warehouse_id: warehouseId,
      receipt_number: grNumber as string,
      received_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (grErr) return { ok: false, error: friendlyDbError(grErr) };

  // Receipt lines -> trigger inserts purchase_in stock movements automatically.
  const { error: grlErr } = await supabase.from('erp_goods_receipt_lines').insert(
    lines.map((l) => ({
      goods_receipt_id: receipt.id,
      product_id: l.product_id,
      quantity_received: l.quantity,
    })),
  );
  if (grlErr) return { ok: false, error: friendlyDbError(grlErr) };

  // Mark PO received + received quantities
  await supabase.from('erp_purchase_orders').update({ status: 'received' }).eq('id', poId);
  for (const l of lines) {
    await supabase
      .from('erp_purchase_order_lines')
      .update({ received_qty: l.quantity })
      .eq('id', l.id);
  }

  // Post Inventory (1300) debit / AP (2100) credit journal for the receipt total.
  const amount = Number(po.net_amount);
  if (amount > 0) {
    const { data: accounts } = await supabase
      .from('erp_chart_of_accounts')
      .select('id, code')
      .in('code', ['1300', '2100'])
      .eq('is_system', true);
    const inv = accounts?.find((a) => a.code === '1300');
    const ap = accounts?.find((a) => a.code === '2100');
    if (inv && ap) {
      const { data: jvNumber } = await supabase.rpc('erp_next_number', {
        p_branch_id: po.branch_id,
        p_seq_type: 'journal',
      });
      const { data: entry } = await supabase
        .from('erp_journal_entries')
        .insert({
          entry_number: jvNumber as string,
          description: `استلام بضاعة ${grNumber} لأمر الشراء ${po.po_number}`,
          reference_type: 'goods_receipt',
          reference_id: receipt.id,
          branch_id: po.branch_id,
          status: 'posted',
          created_by: ctx!.userId,
          posted_by: ctx!.userId,
          posted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (entry) {
        await supabase.from('erp_journal_lines').insert([
          { journal_entry_id: entry.id, account_id: inv.id, debit: amount, credit: 0, description: `مخزون - ${grNumber}` },
          { journal_entry_id: entry.id, account_id: ap.id, debit: 0, credit: amount, description: `موردون - ${grNumber}` },
        ]);
      }
    }
  }

  // Raise supplier payable balance
  const { data: supplier } = await supabase
    .from('erp_suppliers')
    .select('balance')
    .eq('id', po.supplier_id)
    .single();
  if (supplier) {
    await supabase
      .from('erp_suppliers')
      .update({ balance: Number(supplier.balance) + amount })
      .eq('id', po.supplier_id);
  }

  revalidatePath('/purchases/orders');
  revalidatePath('/suppliers');
  revalidatePath('/warehouses');
  return { ok: true };
}
