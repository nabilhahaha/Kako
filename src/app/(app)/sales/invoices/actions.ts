'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';

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
  const { t } = await getT();

  if (!input.branch_id) return { ok: false, error: t('sales.branchRequired') };
  if (!input.customer_id) return { ok: false, error: t('sales.customerRequired') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('sales.atLeastOneLine') };

  const supabase = await createClient();

  // Block selling to customers awaiting admin approval.
  const { data: cust } = await supabase
    .from('erp_customers')
    .select('is_approved')
    .eq('id', input.customer_id)
    .maybeSingle();
  if (cust && cust.is_approved === false) {
    return { ok: false, error: t('sales.invoiceErrCustomerPending') };
  }

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
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  // Atomic: stock-out + AR/Revenue journal + customer balance in one tx.
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_issue_invoice', { p_invoice_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };

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
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const { t } = await getT();
  if (!(input.amount > 0)) return { ok: false, error: t('sales.invoiceErrAmountPositive') };

  // Atomic: payment row (fires Cash/AR journal + invoice update) + balance.
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_record_payment', {
    p_invoice_id: input.invoice_id,
    p_amount: input.amount,
    p_method: input.payment_method,
    p_ref: input.reference_number ?? null,
    p_date: input.payment_date ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

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
