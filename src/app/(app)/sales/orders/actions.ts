'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import { logPriceOverrides } from '@/lib/erp/pricing-server';
import { statusBlocks, statusBlockMessageKey } from '@/lib/erp/customer-status';
import { getT } from '@/lib/i18n/server';

interface OrderInput {
  branch_id: string;
  customer_id: string;
  notes?: string;
  lines: LineInput[];
}

export async function createSalesOrder(input: OrderInput): Promise<ActionResult<{ id: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();

  if (!input.branch_id) return { ok: false, error: t('sales.branchRequired') };
  if (!input.customer_id) return { ok: false, error: t('sales.customerRequired') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('sales.atLeastOneLine') };

  const supabase = await createClient();

  // Consistency with invoicing: don't sell to a customer awaiting approval,
  // suspended, or blocked (FP-CS — collections/returns stay allowed elsewhere).
  const { data: cust } = await supabase
    .from('erp_customers')
    .select('is_approved, customer_status')
    .eq('id', input.customer_id)
    .maybeSingle();
  if (cust && cust.is_approved === false) {
    return { ok: false, error: t('sales.orderErrCustomerPending') };
  }
  if (cust && statusBlocks(cust.customer_status, 'order')) {
    return { ok: false, error: t(statusBlockMessageKey(cust.customer_status)) };
  }

  const totals = computeTotals(lines);

  const { data: orderNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: 'sales_order',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: order, error: orderErr } = await supabase
    .from('erp_sales_orders')
    .insert({
      branch_id: input.branch_id,
      customer_id: input.customer_id,
      order_number: orderNumber as string,
      status: 'draft',
      total_amount: totals.total_amount,
      discount_amount: totals.discount_amount,
      tax_amount: totals.tax_amount,
      net_amount: totals.net_amount,
      notes: input.notes?.trim() || null,
      salesman_id: ctx!.userId,
      created_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (orderErr) return { ok: false, error: friendlyDbError(orderErr) };

  const lineRows = lines.map((l) => {
    const c = computeLine(l);
    return {
      sales_order_id: order.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_pct: l.discount_pct,
      line_total: c.net,
      // U2/U3: UoM capture — quantity/unit_price are BASE; this snapshots what the
      // user actually entered (NULL ⇒ base unit). Stock/finance stay base-driven.
      entered_uom: l.entered_uom ?? null,
      entered_qty: l.entered_qty ?? null,
      uom_factor: l.uom_factor ?? null,
    };
  });
  const { error: linesErr } = await supabase.from('erp_sales_order_lines').insert(lineRows);
  if (linesErr) {
    await supabase.from('erp_sales_orders').delete().eq('id', order.id);
    return { ok: false, error: friendlyDbError(linesErr) };
  }

  // Pricing engine: log any line priced away from the resolved price (audit).
  await logPriceOverrides(supabase, {
    companyId: ctx!.companyId, entity: 'sales_order', recordId: order.id,
    customerId: input.customer_id, branchId: input.branch_id, lines,
  });

  await emitDomainEvent({ eventType: EVENT.ORDER_CREATED, entity: 'order', recordId: order.id });
  revalidatePath('/sales/orders');
  return { ok: true, data: { id: order.id } };
}

export async function cancelSalesOrder(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_sales_orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'draft');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/sales/orders');
  return { ok: true };
}

/** Convert a draft/confirmed order into a draft invoice, copying its lines. */
export async function convertOrderToInvoice(orderId: string): Promise<ActionResult<{ invoiceId: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { data: order, error: oErr } = await supabase
    .from('erp_sales_orders')
    .select('*')
    .eq('id', orderId)
    .single();
  const { t } = await getT();
  if (oErr || !order) return { ok: false, error: t('sales.orderErrNotFound') };
  if (order.status === 'invoiced') return { ok: false, error: t('sales.orderErrAlreadyInvoiced') };
  if (order.status === 'cancelled') return { ok: false, error: t('sales.orderErrCancelledCannotInvoice') };

  const { data: lines } = await supabase
    .from('erp_sales_order_lines')
    .select('*')
    .eq('sales_order_id', orderId);

  const { data: invNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: order.branch_id,
    p_seq_type: 'invoice',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: invoice, error: invErr } = await supabase
    .from('erp_invoices')
    .insert({
      branch_id: order.branch_id,
      customer_id: order.customer_id,
      invoice_number: invNumber as string,
      sales_order_id: order.id,
      status: 'draft',
      total_amount: order.total_amount,
      discount_amount: order.discount_amount,
      tax_amount: order.tax_amount,
      net_amount: order.net_amount,
      created_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (invErr) return { ok: false, error: friendlyDbError(invErr) };

  if (lines && lines.length > 0) {
    await supabase.from('erp_invoice_lines').insert(
      lines.map((l) => ({
        invoice_id: invoice.id,
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        line_total: l.line_total,
        // Carry the UoM snapshot forward so the invoice reflects the same entry.
        entered_uom: l.entered_uom ?? null,
        entered_qty: l.entered_qty ?? null,
        uom_factor: l.uom_factor ?? null,
      })),
    );
  }

  await supabase.from('erp_sales_orders').update({ status: 'invoiced' }).eq('id', orderId);

  revalidatePath('/sales/orders');
  revalidatePath('/sales/invoices');
  return { ok: true, data: { invoiceId: invoice.id } };
}
