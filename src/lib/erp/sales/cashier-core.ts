// ============================================================================
// Session-decoupled core for the supermarket fast-cashier sale, reused by the
// online action (market/actions.ts) and the reconciliation worker (offline POS
// orders → real invoices). Composes the invoice cores; all stock/AR/payment
// effects stay in their DB RPCs. Resumable + idempotent on an optional key so a
// reconcile retry that already created/issued the invoice continues safely.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import type { ActionResult } from '@/lib/erp/guards';
import { createInvoiceCore, issueInvoiceCore, recordPaymentCore, type CoreCtx, type Translate } from './invoice-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** Find or create the branch's walk-in "cash customer". */
export async function cashCustomerIdCore(supabase: Db, branchId: string): Promise<string | null> {
  const code = `CASH-${branchId}`;
  const { data: existing } = await supabase.from('erp_customers').select('id').eq('code', code).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase
    .from('erp_customers')
    .insert({ code, name: 'عميل نقدي', name_ar: 'عميل نقدي', branch_id: branchId, is_approved: true })
    .select('id').single();
  if (error) return null;
  return (data as { id: string }).id;
}

export interface CashierCheckoutInput { branch_id: string; lines: LineInput[]; payment_method: PaymentMethod }

export async function cashierCheckoutCore(
  supabase: Db, ctx: CoreCtx, t: Translate, input: CashierCheckoutInput,
  opts: { idempotencyKey?: string } = {},
): Promise<ActionResult<{ invoice_id: string; invoice_number: string; net: number }>> {
  if (!ctx.companyId) return { ok: false, error: t('market.errors.noCompany') };
  if (!input.branch_id) return { ok: false, error: t('market.errors.branchRequired') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('market.errors.noItems') };

  const customerId = await cashCustomerIdCore(supabase, input.branch_id);
  if (!customerId) return { ok: false, error: t('market.errors.cashCustomerFailed') };

  const created = await createInvoiceCore(supabase, ctx, t, {
    branch_id: input.branch_id, customer_id: customerId, lines, idempotency_key: opts.idempotencyKey,
  });
  if (!created.ok || !created.data) return { ok: false, error: created.error };
  const invoiceId = created.data.id;

  // Resumable: only issue a still-draft invoice (a reconcile retry may resume here
  // after a crash between create and issue). Online this is always a fresh draft.
  const { data: cur } = await supabase.from('erp_invoices').select('status').eq('id', invoiceId).maybeSingle();
  if (((cur as { status?: string } | null)?.status ?? 'draft') === 'draft') {
    const issued = await issueInvoiceCore(supabase, t, invoiceId);
    if (!issued.ok) return { ok: false, error: t('market.errors.saleFailed', { detail: issued.error ?? '' }) };
  }

  const net = computeTotals(lines).net_amount;
  // erp_record_payment is idempotent on its key → safe to (re)call on resume.
  const paid = await recordPaymentCore(supabase, t, {
    invoice_id: invoiceId, amount: net, payment_method: input.payment_method,
    idempotency_key: opts.idempotencyKey,  // mirror pk (uuid) — erp_record_payment dedupes on it
  });
  if (!paid.ok) return { ok: false, error: t('market.errors.paymentFailed', { detail: paid.error ?? '' }) };

  const { data } = await supabase.from('erp_invoices').select('invoice_number').eq('id', invoiceId).single();
  return { ok: true, data: { invoice_id: invoiceId, invoice_number: (data as { invoice_number?: string } | null)?.invoice_number ?? '', net } };
}
