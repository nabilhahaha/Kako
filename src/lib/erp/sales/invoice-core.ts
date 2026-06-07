// ============================================================================
// Session-decoupled cores for the invoice money-path, so the SAME audited logic
// runs both online (server actions, RLS as the user) and in the service-role
// reconciliation worker (offline-created orders → real invoices). The financial
// work itself stays in the existing DB RPCs — erp_next_number (numbering),
// erp_issue_invoice (stock-out + AR/Revenue journal + balance) and
// erp_record_payment (payment posting); nothing is re-implemented here.
//
// A core takes its Supabase client, an explicit auth context, and a translator,
// so the caller owns the session/RLS decision. Wrappers in
// app/(app)/sales/invoices/actions.ts resolve the session and add revalidation.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import { logPriceOverrides } from '@/lib/erp/pricing-server';
import { statusBlocks, statusBlockMessageKey } from '@/lib/erp/customer-status';
import type { PaymentMethod } from '@/lib/erp/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
export interface CoreCtx { userId: string; companyId: string | null }
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export interface InvoiceCoreInput {
  branch_id: string;
  customer_id: string;
  due_date?: string;
  notes?: string;
  lines: LineInput[];
  idempotency_key?: string;
  // Offline-reconciliation credit policy: a sale already made in the field is
  // never rejected for over-credit — it is materialized and flagged for review
  // instead. Online callers leave these unset (over-credit still blocks at create).
  allow_over_credit?: boolean;
  requires_credit_review?: boolean;
}

/** Insert a draft invoice + lines (numbering via erp_next_number). Idempotent on
 *  idempotency_key. Identical to the online createInvoice body, session removed. */
export async function createInvoiceCore(
  supabase: Db, ctx: CoreCtx, t: Translate, input: InvoiceCoreInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.branch_id) return { ok: false, error: t('sales.branchRequired') };
  if (!input.customer_id) return { ok: false, error: t('sales.customerRequired') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('sales.atLeastOneLine') };

  const { data: cust } = await supabase
    .from('erp_customers').select('is_approved, credit_limit, balance, customer_status')
    .eq('id', input.customer_id).maybeSingle();
  if (cust && cust.is_approved === false) return { ok: false, error: t('sales.invoiceErrCustomerPending') };
  if (cust && statusBlocks((cust as { customer_status?: string }).customer_status, 'invoice')) {
    return { ok: false, error: t(statusBlockMessageKey((cust as { customer_status?: string }).customer_status)) };
  }

  const totals = computeTotals(lines);
  const c = cust as { credit_limit?: number; balance?: number } | null;
  // Over-credit blocks online; offline reconciliation passes allow_over_credit and
  // flags the invoice for review instead of rejecting a sale that already happened.
  if (!input.allow_over_credit && c && Number(c.credit_limit) > 0 && Number(c.balance) + totals.net_amount > Number(c.credit_limit)) {
    return { ok: false, error: t('sales.errOverCredit') };
  }

  // Stock pre-check (only for products actually tracked in the branch).
  const { data: whRows } = await supabase.from('erp_warehouses').select('id').eq('branch_id', input.branch_id);
  const whIds = (whRows ?? []).map((w) => (w as { id: string }).id);
  if (whIds.length > 0) {
    const productIds = [...new Set(lines.map((l) => l.product_id))];
    const { data: stockRows } = await supabase
      .from('erp_inventory_stock').select('product_id, quantity, reserved_qty')
      .in('warehouse_id', whIds).in('product_id', productIds);
    const tracked = new Set<string>();
    const avail = new Map<string, number>();
    for (const s of (stockRows ?? []) as { product_id: string; quantity: number; reserved_qty: number }[]) {
      tracked.add(s.product_id);
      avail.set(s.product_id, (avail.get(s.product_id) ?? 0) + (Number(s.quantity) - Number(s.reserved_qty)));
    }
    const want = new Map<string, number>();
    for (const l of lines) want.set(l.product_id, (want.get(l.product_id) ?? 0) + Number(l.quantity));
    for (const [pid, qty] of want) {
      if (tracked.has(pid) && (avail.get(pid) ?? 0) < qty) return { ok: false, error: t('sales.errInsufficientStock') };
    }
  }

  // Idempotency: a retry with the same key returns the already-created invoice.
  if (input.idempotency_key) {
    const { data: existing } = await supabase
      .from('erp_invoices').select('id').eq('idempotency_key', input.idempotency_key).maybeSingle();
    if (existing) return { ok: true, data: { id: (existing as { id: string }).id } };
  }

  const { data: invNumber, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id, p_seq_type: 'invoice',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: invoice, error: invErr } = await supabase
    .from('erp_invoices').insert({
      branch_id: input.branch_id, customer_id: input.customer_id, invoice_number: invNumber as string,
      idempotency_key: input.idempotency_key ?? null, status: 'draft',
      total_amount: totals.total_amount, discount_amount: totals.discount_amount,
      tax_amount: totals.tax_amount, net_amount: totals.net_amount,
      due_date: input.due_date || null, notes: input.notes?.trim() || null, created_by: ctx.userId,
      requires_credit_review: input.requires_credit_review ?? false,
    }).select('id').single();
  if (invErr) {
    // Concurrency backstop: if we lost the race on the idempotency key (uq_erp_invoices_idem,
    // 23505), the winner's invoice already exists → return it instead of failing.
    if ((invErr as { code?: string }).code === '23505' && input.idempotency_key) {
      const { data: won } = await supabase
        .from('erp_invoices').select('id').eq('idempotency_key', input.idempotency_key).maybeSingle();
      if (won) return { ok: true, data: { id: (won as { id: string }).id } };
    }
    return { ok: false, error: friendlyDbError(invErr) };
  }

  const lineRows = lines.map((l) => {
    const cl = computeLine(l);
    return { invoice_id: invoice.id, product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price, discount_pct: l.discount_pct, line_total: cl.net };
  });
  const { error: linesErr } = await supabase.from('erp_invoice_lines').insert(lineRows);
  if (linesErr) {
    await supabase.from('erp_invoices').delete().eq('id', invoice.id);
    return { ok: false, error: friendlyDbError(linesErr) };
  }

  await logPriceOverrides(supabase, {
    companyId: ctx.companyId!, entity: 'invoice', recordId: invoice.id,
    customerId: input.customer_id, branchId: input.branch_id, lines,
  });
  return { ok: true, data: { id: invoice.id } };
}

/** Issue a draft invoice via erp_issue_invoice (stock-out + AR/Revenue + balance). */
export async function issueInvoiceCore(supabase: Db, t: Translate, id: string): Promise<ActionResult> {
  const { data: inv } = await supabase.from('erp_invoices').select('customer_id').eq('id', id).maybeSingle();
  const customerId = (inv as { customer_id?: string } | null)?.customer_id;
  if (customerId) {
    const { data: cu } = await supabase.from('erp_customers').select('customer_status').eq('id', customerId).maybeSingle();
    const st = (cu as { customer_status?: string } | null)?.customer_status;
    if (statusBlocks(st, 'invoice')) return { ok: false, error: t(statusBlockMessageKey(st)) };
  }
  const { error } = await supabase.rpc('erp_issue_invoice', { p_invoice_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}

/** Wholesale invoice = create + issue + optional cash collection. Reuses the
 *  cores; resumable + idempotent on idempotencyKey (for the reconcile worker). */
export async function wholesaleInvoiceCore(
  supabase: Db, ctx: CoreCtx, t: Translate,
  input: { branch_id: string; customer_id: string; lines: LineInput[]; collect: boolean; payment_method: PaymentMethod },
  opts: { idempotencyKey?: string } = {},
): Promise<ActionResult<{ invoice_id: string; invoice_number: string }>> {
  if (!ctx.companyId) return { ok: false, error: t('wholesale.noCompany') };
  if (!input.branch_id) return { ok: false, error: t('wholesale.errBranchRequired') };
  if (!input.customer_id) return { ok: false, error: t('wholesale.errCustomerRequired') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('wholesale.errAtLeastOneItem') };

  const created = await createInvoiceCore(supabase, ctx, t, {
    branch_id: input.branch_id, customer_id: input.customer_id, lines, idempotency_key: opts.idempotencyKey,
  });
  if (!created.ok || !created.data) return { ok: false, error: created.error };
  const invoiceId = created.data.id;

  const { data: cur } = await supabase.from('erp_invoices').select('status').eq('id', invoiceId).maybeSingle();
  if (((cur as { status?: string } | null)?.status ?? 'draft') === 'draft') {
    const issued = await issueInvoiceCore(supabase, t, invoiceId);
    if (!issued.ok) return { ok: false, error: t('wholesale.errIssueFailed', { detail: issued.error ?? '' }) };
  }

  if (input.collect) {
    const net = computeTotals(lines).net_amount;
    const paid = await recordPaymentCore(supabase, t, {
      invoice_id: invoiceId, amount: net, payment_method: input.payment_method,
      idempotency_key: opts.idempotencyKey,  // mirror pk (uuid) — erp_record_payment dedupes on it
    });
    if (!paid.ok) return { ok: false, error: t('wholesale.errCollectFailed', { detail: paid.error ?? '' }) };
  }

  const { data } = await supabase.from('erp_invoices').select('invoice_number').eq('id', invoiceId).single();
  return { ok: true, data: { invoice_id: invoiceId, invoice_number: (data as { invoice_number?: string } | null)?.invoice_number ?? '' } };
}

/** Post a payment via erp_record_payment (atomic + idempotent on idempotency_key). */
export async function recordPaymentCore(supabase: Db, t: Translate, input: {
  invoice_id: string; amount: number; payment_method: PaymentMethod;
  reference_number?: string; payment_date?: string; idempotency_key?: string;
}): Promise<ActionResult> {
  if (!(input.amount > 0)) return { ok: false, error: t('sales.invoiceErrAmountPositive') };
  const { error } = await supabase.rpc('erp_record_payment', {
    p_invoice_id: input.invoice_id, p_amount: input.amount, p_method: input.payment_method,
    p_ref: input.reference_number ?? null, p_date: input.payment_date ?? null,
    p_idempotency_key: input.idempotency_key ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true };
}
