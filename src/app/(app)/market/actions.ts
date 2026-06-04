'use server';

import { createClient } from '@/lib/supabase/server';
import { requirePermission, type ActionResult, friendlyDbError } from '@/lib/erp/guards';
import { computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { createInvoice, issueInvoice, recordPayment } from '../sales/invoices/actions';
import { getT } from '@/lib/i18n/server';

// Supermarket fast cashier: a walk-in sale against a default cash customer,
// reusing the invoice engine (stock-out + AR/Revenue + cash payment).

/** Find or create the branch's walk-in "cash customer". */
async function cashCustomerId(supabase: Awaited<ReturnType<typeof createClient>>, branchId: string): Promise<string | null> {
  const code = `CASH-${branchId}`;
  const { data: existing } = await supabase.from('erp_customers').select('id').eq('code', code).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase
    .from('erp_customers')
    .insert({ code, name: 'عميل نقدي', name_ar: 'عميل نقدي', branch_id: branchId, is_approved: true })
    .select('id')
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

export async function cashierCheckout(input: {
  branch_id: string;
  lines: LineInput[];
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_id: string; invoice_number: string; net: number }>> {
  const ctx = await requirePermission('market.pos');
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('market.errors.noCompany') };
  if (!input.branch_id) return { ok: false, error: t('market.errors.branchRequired') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('market.errors.noItems') };

  const supabase = await createClient();
  const customerId = await cashCustomerId(supabase, input.branch_id);
  if (!customerId) return { ok: false, error: t('market.errors.cashCustomerFailed') };

  const created = await createInvoice({ branch_id: input.branch_id, customer_id: customerId, lines });
  if (!created.ok || !created.data) return { ok: false, error: created.error };
  const invoiceId = created.data.id;

  const issued = await issueInvoice(invoiceId);
  if (!issued.ok) return { ok: false, error: t('market.errors.saleFailed', { detail: issued.error ?? '' }) };

  const net = computeTotals(lines).net_amount;
  const paid = await recordPayment({ invoice_id: invoiceId, amount: net, payment_method: input.payment_method });
  if (!paid.ok) return { ok: false, error: t('market.errors.paymentFailed', { detail: paid.error ?? '' }) };

  const { data } = await supabase.from('erp_invoices').select('invoice_number').eq('id', invoiceId).single();
  return { ok: true, data: { invoice_id: invoiceId, invoice_number: (data as { invoice_number?: string } | null)?.invoice_number ?? '', net } };
}
