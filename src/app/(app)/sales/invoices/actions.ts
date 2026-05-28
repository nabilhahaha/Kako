'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';

interface InvoiceInput {
  branch_id: string;
  customer_id: string;
  due_date?: string;
  notes?: string;
  lines: LineInput[];
}

export async function createInvoice(input: InvoiceInput): Promise<ActionResult<{ id: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  if (!input.branch_id) return { ok: false, error: 'الفرع مطلوب.' };
  if (!input.customer_id) return { ok: false, error: 'العميل مطلوب.' };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'أضف بنداً واحداً على الأقل.' };

  const supabase = await createClient();
  const totals = computeTotals(lines);

  const { data: invNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: 'invoice',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: invoice, error: invErr } = await supabase
    .from('erp_invoices')
    .insert({
      branch_id: input.branch_id,
      customer_id: input.customer_id,
      invoice_number: invNumber as string,
      status: 'draft',
      total_amount: totals.total_amount,
      discount_amount: totals.discount_amount,
      tax_amount: totals.tax_amount,
      net_amount: totals.net_amount,
      due_date: input.due_date || null,
      notes: input.notes?.trim() || null,
      created_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (invErr) return { ok: false, error: friendlyDbError(invErr) };

  const lineRows = lines.map((l) => {
    const c = computeLine(l);
    return {
      invoice_id: invoice.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      line_total: c.net,
    };
  });
  const { error: linesErr } = await supabase.from('erp_invoice_lines').insert(lineRows);
  if (linesErr) {
    await supabase.from('erp_invoices').delete().eq('id', invoice.id);
    return { ok: false, error: friendlyDbError(linesErr) };
  }

  revalidatePath('/sales/invoices');
  return { ok: true, data: { id: invoice.id } };
}

/**
 * Issue a draft invoice: deduct stock from the branch warehouse and flip the
 * status to 'issued', which fires the DB trigger that posts the AR/Revenue
 * journal entry. Also increases the customer's outstanding balance.
 */
export async function issueInvoice(id: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { data: invoice, error: invErr } = await supabase
    .from('erp_invoices')
    .select('*')
    .eq('id', id)
    .single();
  if (invErr || !invoice) return { ok: false, error: 'الفاتورة غير موجودة.' };
  if (invoice.status !== 'draft') return { ok: false, error: 'لا يمكن إصدار إلا الفواتير المسودة.' };

  const { data: lines } = await supabase
    .from('erp_invoice_lines')
    .select('*')
    .eq('invoice_id', id);
  if (!lines || lines.length === 0) return { ok: false, error: 'الفاتورة بلا بنود.' };

  // Deduct stock from the branch's first active warehouse (if any).
  const { data: warehouse } = await supabase
    .from('erp_warehouses')
    .select('id')
    .eq('branch_id', invoice.branch_id)
    .eq('is_active', true)
    .order('code')
    .limit(1)
    .maybeSingle();

  if (warehouse) {
    const movements = lines.map((l) => ({
      movement_type: 'sale_out' as const,
      warehouse_id: warehouse.id,
      product_id: l.product_id,
      quantity: -Math.abs(Number(l.quantity)),
      reference_type: 'invoice',
      reference_id: id,
      notes: `بيع: ${invoice.invoice_number}`,
      created_by: ctx!.userId,
    }));
    const { error: movErr } = await supabase.from('erp_stock_movements').insert(movements);
    if (movErr) return { ok: false, error: friendlyDbError(movErr) };
  }

  // Flip status -> fires AR/Revenue journal trigger.
  const { error: statusErr } = await supabase
    .from('erp_invoices')
    .update({ status: 'issued' })
    .eq('id', id);
  if (statusErr) return { ok: false, error: friendlyDbError(statusErr) };

  // Increase customer receivable balance.
  const { data: customer } = await supabase
    .from('erp_customers')
    .select('balance')
    .eq('id', invoice.customer_id)
    .single();
  if (customer) {
    await supabase
      .from('erp_customers')
      .update({ balance: Number(customer.balance) + Number(invoice.net_amount) })
      .eq('id', invoice.customer_id);
  }

  revalidatePath('/sales/invoices');
  revalidatePath('/customers');
  return { ok: true };
}

export async function recordPayment(input: {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  payment_date?: string;
}): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  if (!(input.amount > 0)) return { ok: false, error: 'المبلغ يجب أن يكون أكبر من صفر.' };

  const supabase = await createClient();
  const { data: invoice, error: invErr } = await supabase
    .from('erp_invoices')
    .select('*')
    .eq('id', input.invoice_id)
    .single();
  if (invErr || !invoice) return { ok: false, error: 'الفاتورة غير موجودة.' };
  if (invoice.status === 'draft') return { ok: false, error: 'أصدر الفاتورة قبل التحصيل.' };
  if (invoice.status === 'cancelled') return { ok: false, error: 'الفاتورة ملغية.' };

  const remaining = Number(invoice.net_amount) - Number(invoice.paid_amount);
  if (input.amount > remaining + 0.001)
    return { ok: false, error: `المبلغ يتجاوز المتبقي (${remaining.toFixed(2)}).` };

  // Insert payment -> trigger posts the Cash/AR journal and updates the
  // invoice paid_amount + status.
  const { error: payErr } = await supabase.from('erp_payments').insert({
    invoice_id: input.invoice_id,
    amount: input.amount,
    payment_method: input.payment_method,
    reference_number: input.reference_number?.trim() || null,
    payment_date: input.payment_date || new Date().toISOString().slice(0, 10),
    received_by: ctx!.userId,
  });
  if (payErr) return { ok: false, error: friendlyDbError(payErr) };

  // Reduce customer receivable balance.
  const { data: customer } = await supabase
    .from('erp_customers')
    .select('balance')
    .eq('id', invoice.customer_id)
    .single();
  if (customer) {
    await supabase
      .from('erp_customers')
      .update({ balance: Number(customer.balance) - Number(input.amount) })
      .eq('id', invoice.customer_id);
  }

  revalidatePath('/sales/invoices');
  revalidatePath('/customers');
  return { ok: true };
}

export async function cancelInvoice(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_invoices')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/invoices');
  return { ok: true };
}
