'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

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
  invoice_id?: string | null;
  reason?: string;
  notes?: string;
  lines: ReturnLineInput[];
}): Promise<ActionResult<{ id: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();

  if (!input.branch_id) return { ok: false, error: t('sales.branchRequired') };
  if (!input.customer_id) return { ok: false, error: t('sales.customerRequired') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('sales.atLeastOneLine') };

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
      invoice_id: input.invoice_id || null,
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
export async function completeReturn(
  id: string,
  refundMethod: 'credit' | 'cash' = 'credit',
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  // Invoice-linked double-return guard + cash/credit refund live in the RPC.
  const { error } = await supabase.rpc('erp_complete_sales_return_ex', {
    p_return_id: id,
    p_refund_method: refundMethod === 'cash' ? 'cash' : 'credit',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/sales/returns');
  revalidatePath('/customers');
  revalidatePath('/inventory');
  return { ok: true };
}

/** Issued invoices for a customer (to link a return/exchange to its source). */
export async function loadCustomerInvoices(
  customerId: string,
): Promise<ActionResult<{ invoices: { id: string; invoice_number: string; created_at: string }[] }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, created_at')
    .eq('customer_id', customerId)
    .in('status', ['issued', 'partially_paid', 'paid', 'overdue'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, data: { invoices: (data as { id: string; invoice_number: string; created_at: string }[]) ?? [] } };
}

/** Returnable lines (qty still allowed) for an invoice — pre-fills + caps the form. */
export async function loadReturnableLines(
  invoiceId: string,
): Promise<ActionResult<{ lines: { product_id: string; returnable_qty: number; unit_price: number }[] }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const [{ data: avail, error: e1 }, { data: invLines, error: e2 }] = await Promise.all([
    supabase.rpc('erp_invoice_returnable', { p_invoice_id: invoiceId }),
    supabase.from('erp_invoice_lines').select('product_id, unit_price').eq('invoice_id', invoiceId),
  ]);
  if (e1) return { ok: false, error: friendlyDbError(e1) };
  if (e2) return { ok: false, error: friendlyDbError(e2) };
  const priceByProduct = new Map((invLines ?? []).map((l) => [l.product_id as string, Number(l.unit_price)]));
  const lines = ((avail as { product_id: string; returnable_qty: number }[]) ?? [])
    .filter((l) => Number(l.returnable_qty) > 0)
    .map((l) => ({ product_id: l.product_id, returnable_qty: Number(l.returnable_qty), unit_price: priceByProduct.get(l.product_id) ?? 0 }));
  return { ok: true, data: { lines } };
}

/** Post an exchange: return an item and sell a replacement in one audited tx. */
export async function createExchange(input: {
  invoice_id: string;
  returned_product_id: string;
  return_qty: number;
  new_product_id: string;
  new_qty: number;
  new_unit_price: number;
  settle_method: 'cash' | 'credit';
}): Promise<ActionResult<{ price_difference: number }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!input.invoice_id) return { ok: false, error: t('sales.exchErrInvoice') };
  if (!input.returned_product_id || !input.new_product_id) return { ok: false, error: t('sales.exchErrProducts') };
  if (!(input.return_qty > 0) || !(input.new_qty > 0)) return { ok: false, error: t('sales.exchErrQty') };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_post_exchange', {
    p_invoice_id: input.invoice_id,
    p_returned_product_id: input.returned_product_id,
    p_return_qty: input.return_qty,
    p_new_product_id: input.new_product_id,
    p_new_qty: input.new_qty,
    p_new_unit_price: input.new_unit_price,
    p_settle_method: input.settle_method === 'credit' ? 'credit' : 'cash',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/returns');
  revalidatePath('/inventory');
  revalidatePath('/customers');
  return { ok: true, data: { price_difference: Number((data as { price_difference?: number })?.price_difference ?? 0) } };
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
