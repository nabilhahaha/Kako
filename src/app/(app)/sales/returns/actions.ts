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
 * Complete a return: restock the goods (return_in movements), post the
 * contra-revenue journal (Debit Sales Returns / Credit AR), and lower the
 * customer's outstanding balance.
 */
export async function completeReturn(id: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { data: ret, error: rErr } = await supabase
    .from('erp_sales_returns')
    .select('*')
    .eq('id', id)
    .single();
  if (rErr || !ret) return { ok: false, error: 'المرتجع غير موجود.' };
  if (ret.status === 'completed') return { ok: false, error: 'تم اعتماد هذا المرتجع بالفعل.' };
  if (ret.status === 'cancelled') return { ok: false, error: 'المرتجع ملغي.' };

  const { data: lines } = await supabase
    .from('erp_sales_return_lines')
    .select('*')
    .eq('return_id', id);
  if (!lines || lines.length === 0) return { ok: false, error: 'المرتجع بلا بنود.' };

  // Restock into the branch's first active warehouse (if any).
  const { data: warehouse } = await supabase
    .from('erp_warehouses')
    .select('id')
    .eq('branch_id', ret.branch_id)
    .eq('is_active', true)
    .order('code')
    .limit(1)
    .maybeSingle();
  if (warehouse) {
    const { error: movErr } = await supabase.from('erp_stock_movements').insert(
      lines.map((l) => ({
        movement_type: 'return_in' as const,
        warehouse_id: warehouse.id,
        product_id: l.product_id,
        quantity: Math.abs(Number(l.quantity)),
        reference_type: 'sales_return',
        reference_id: id,
        notes: `مرتجع: ${ret.return_number}`,
        created_by: ctx!.userId,
      })),
    );
    if (movErr) return { ok: false, error: friendlyDbError(movErr) };
  }

  // Journal: Debit Sales Returns (4110) / Credit AR (1200).
  const amount = Number(ret.total_amount);
  if (amount > 0) {
    const { data: accounts } = await supabase
      .from('erp_chart_of_accounts')
      .select('id, code')
      .in('code', ['4110', '1200'])
      .eq('is_system', true);
    const salesReturns = accounts?.find((a) => a.code === '4110');
    const ar = accounts?.find((a) => a.code === '1200');
    if (salesReturns && ar) {
      const { data: jvNumber } = await supabase.rpc('erp_next_number', {
        p_branch_id: ret.branch_id,
        p_seq_type: 'journal',
      });
      const { data: entry } = await supabase
        .from('erp_journal_entries')
        .insert({
          entry_number: jvNumber as string,
          description: `مرتجع مبيعات ${ret.return_number}`,
          reference_type: 'sales_return',
          reference_id: id,
          branch_id: ret.branch_id,
          status: 'posted',
          created_by: ctx!.userId,
          posted_by: ctx!.userId,
          posted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (entry) {
        await supabase.from('erp_journal_lines').insert([
          { journal_entry_id: entry.id, account_id: salesReturns.id, debit: amount, credit: 0, description: `مرتجع ${ret.return_number}` },
          { journal_entry_id: entry.id, account_id: ar.id, debit: 0, credit: amount, description: `مرتجع ${ret.return_number}` },
        ]);
      }
    }
  }

  // Lower customer receivable.
  const { data: customer } = await supabase
    .from('erp_customers')
    .select('balance')
    .eq('id', ret.customer_id)
    .single();
  if (customer) {
    await supabase
      .from('erp_customers')
      .update({ balance: Number(customer.balance) - amount })
      .eq('id', ret.customer_id);
  }

  await supabase.from('erp_sales_returns').update({ status: 'completed', approved_by: ctx!.userId }).eq('id', id);

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
