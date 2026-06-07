'use server';

import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, type ActionResult, friendlyDbError } from '@/lib/erp/guards';
import { repDayBlocked } from '@/lib/erp/work-session';
import type { LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { createInvoice, issueInvoice, recordPayment } from '../invoices/actions';
import { getT } from '@/lib/i18n/server';

/**
 * One-tap field sale: create the invoice, issue it (stock + AR/Revenue
 * journal), optionally collect payment, and log a customer visit.
 */
export async function quickSale(input: {
  branch_id: string;
  customer_id: string;
  lines: LineInput[];
  pay: boolean;
  amount: number;
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_id: string; invoice_number: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  const { t } = await getT();
  if (authErr || !ctx) return { ok: false, error: authErr ?? t('sales.posErrUnauthorized') };

  const blocked = await repDayBlocked(ctx);
  if (blocked) return { ok: false, error: blocked };

  const created = await createInvoice({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    lines: input.lines,
  });
  if (!created.ok || !created.data) return { ok: false, error: created.error };
  const invoiceId = created.data.id;

  const issued = await issueInvoice(invoiceId);
  if (!issued.ok) {
    return { ok: false, error: t('sales.posErrInvoiceDraftOnly', { detail: issued.error ?? '' }) };
  }

  if (input.pay && input.amount > 0) {
    const paid = await recordPayment({
      invoice_id: invoiceId,
      amount: input.amount,
      payment_method: input.payment_method,
    });
    if (!paid.ok) {
      return { ok: false, error: t('sales.posErrCollectionFailed', { detail: paid.error ?? '' }) };
    }
  }

  const supabase = await createClient();
  // Log the visit (journey execution), linked to the invoice.
  const { data: posVisit } = await supabase.from('erp_visits').insert({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    salesman_id: ctx.userId,
    invoice_id: invoiceId,
    no_sale: false,
  }).select('id').single();
  if (posVisit) await emitDomainEvent({ eventType: EVENT.VISIT_COMPLETED, entity: 'visit', recordId: (posVisit as { id: string }).id });

  const { data } = await supabase
    .from('erp_invoices')
    .select('invoice_number')
    .eq('id', invoiceId)
    .single();

  return { ok: true, data: { invoice_id: invoiceId, invoice_number: data?.invoice_number ?? '' } };
}

/** Log a visit where the customer didn't buy. */
export async function logNoSaleVisit(input: {
  branch_id: string;
  customer_id: string;
  notes?: string;
}): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  const { t } = await getT();
  if (authErr || !ctx) return { ok: false, error: authErr ?? t('sales.posErrUnauthorized') };

  const supabase = await createClient();
  const { data: noSaleVisit, error } = await supabase.from('erp_visits').insert({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    salesman_id: ctx.userId,
    no_sale: true,
    notes: input.notes?.trim() || null,
  }).select('id').single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (noSaleVisit) await emitDomainEvent({ eventType: EVENT.VISIT_COMPLETED, entity: 'visit', recordId: (noSaleVisit as { id: string }).id });
  return { ok: true };
}
