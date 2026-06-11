'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import { logPriceOverrides } from '@/lib/erp/pricing-server';
import { statusBlocks, statusBlockMessageKey } from '@/lib/erp/customer-status';
import type { PaymentMethod } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { isEtaConfigured } from '@/lib/eta/config';
import { buildEtaDocument } from '@/lib/eta/document-builder';
import { signDocument, getSigner } from '@/lib/eta/signing';
import { submitDocuments } from '@/lib/eta/client';
import type { EtaInvoiceInput } from '@/lib/eta/types';

interface InvoiceInput {
  branch_id: string;
  customer_id: string;
  due_date?: string;
  notes?: string;
  lines: LineInput[];
  idempotency_key?: string;
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

  // Block selling to customers awaiting admin approval, suspended, or blocked
  // (FP-CS). Collections/returns remain allowed via their own ungated paths.
  const { data: cust } = await supabase
    .from('erp_customers')
    .select('is_approved, credit_limit, balance, customer_status')
    .eq('id', input.customer_id)
    .maybeSingle();
  if (cust && cust.is_approved === false) {
    return { ok: false, error: t('sales.invoiceErrCustomerPending') };
  }
  if (cust && statusBlocks((cust as { customer_status?: string }).customer_status, 'invoice')) {
    return { ok: false, error: t(statusBlockMessageKey((cust as { customer_status?: string }).customer_status)) };
  }

  const totals = computeTotals(lines);

  // Credit-limit pre-check: only when a limit is set (limit 0 = unlimited). Catches
  // over-credit at create instead of failing opaquely later. Raise the limit via
  // the credit-limit-request workflow.
  const c = cust as { credit_limit?: number; balance?: number } | null;
  if (c && Number(c.credit_limit) > 0 && Number(c.balance) + totals.net_amount > Number(c.credit_limit)) {
    return { ok: false, error: t('sales.errOverCredit') };
  }

  // Stock pre-check: block a line that exceeds available stock — but only for
  // products that are actually tracked in this branch (have stock rows), so pilots
  // that haven't loaded inventory yet can still draft invoices.
  const { data: whRows } = await supabase.from('erp_warehouses').select('id').eq('branch_id', input.branch_id);
  const whIds = (whRows ?? []).map((w) => (w as { id: string }).id);
  if (whIds.length > 0) {
    const productIds = [...new Set(lines.map((l) => l.product_id))];
    const { data: stockRows } = await supabase
      .from('erp_inventory_stock')
      .select('product_id, quantity, reserved_qty')
      .in('warehouse_id', whIds)
      .in('product_id', productIds);
    const tracked = new Set<string>();
    const avail = new Map<string, number>();
    for (const s of (stockRows ?? []) as { product_id: string; quantity: number; reserved_qty: number }[]) {
      tracked.add(s.product_id);
      avail.set(s.product_id, (avail.get(s.product_id) ?? 0) + (Number(s.quantity) - Number(s.reserved_qty)));
    }
    const want = new Map<string, number>();
    for (const l of lines) want.set(l.product_id, (want.get(l.product_id) ?? 0) + Number(l.quantity));
    for (const [pid, qty] of want) {
      if (tracked.has(pid) && (avail.get(pid) ?? 0) < qty) {
        return { ok: false, error: t('sales.errInsufficientStock') };
      }
    }
  }

  // Idempotency: a retry with the same key returns the already-created invoice
  // instead of creating a duplicate (the unique index is the race backstop).
  if (input.idempotency_key) {
    const { data: existing } = await supabase
      .from('erp_invoices').select('id').eq('idempotency_key', input.idempotency_key).maybeSingle();
    if (existing) return { ok: true, data: { id: (existing as { id: string }).id } };
  }

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
      idempotency_key: input.idempotency_key ?? null,
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

  // Pricing engine: log any line priced away from the resolved price (audit).
  await logPriceOverrides(supabase, {
    companyId: ctx!.companyId, entity: 'invoice', recordId: invoice.id,
    customerId: input.customer_id, branchId: input.branch_id, lines,
  });

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
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const { t } = await getT();

  const supabase = await createClient();
  // FP-CS: don't issue (stock-out + AR) for a suspended/blocked customer, even
  // if a draft slipped through before the status changed.
  const { data: inv } = await supabase.from('erp_invoices').select('customer_id').eq('id', id).maybeSingle();
  const customerId = (inv as { customer_id?: string } | null)?.customer_id;
  if (customerId) {
    const { data: cu } = await supabase.from('erp_customers').select('customer_status').eq('id', customerId).maybeSingle();
    const st = (cu as { customer_status?: string } | null)?.customer_status;
    if (statusBlocks(st, 'invoice')) return { ok: false, error: t(statusBlockMessageKey(st)) };
  }

  // Atomic: stock-out + AR/Revenue journal + customer balance in one tx.
  const { error } = await supabase.rpc('erp_issue_invoice', { p_invoice_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Critical-action audit: invoice.finalize (irreversible — stock-out + AR posting).
  await logAudit(supabase, {
    action: 'update', entity: 'invoice', entityId: id,
    details: { event: 'invoice_finalized', customer_id: customerId ?? null }, companyId: ctx.companyId,
  });
  await emitDomainEvent({ eventType: EVENT.INVOICE_ISSUED, entity: 'invoice', recordId: id });
  revalidatePath('/sales/invoices');
  revalidatePath('/customers');
  return { ok: true };
}

/** Submit an issued invoice to the Egyptian Tax Authority (ETA). Fully plumbed
 *  but guarded: returns a clear message until ETA credentials, the company
 *  settings, and a signing certificate are in place (Phase 2). See docs/ETA.md. */
export async function submitInvoiceToEta(id: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  const { t } = await getT();
  if (!ctx) return { ok: false, error: authErr ?? t('sales.etaSubmitFailed') };

  if (!isEtaConfigured()) return { ok: false, error: t('sales.etaNotConfigured') };

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('erp_company_eta_settings')
    .select('*')
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (!settings || !settings.enabled) return { ok: false, error: t('sales.etaNotEnabled') };

  const { data: inv, error: invErr } = await supabase
    .from('erp_invoices')
    .select(
      '*, customer:erp_customers(name, name_ar), lines:erp_invoice_lines(*, product:erp_products_catalog(code, name, name_ar, eta_item_code, eta_item_code_type, eta_unit_type))',
    )
    .eq('id', id)
    .single();
  if (invErr || !inv) return { ok: false, error: invErr ? friendlyDbError(invErr) : t('sales.etaSubmitFailed') };

  const addr = (settings.address ?? {}) as Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = ((inv as any).lines ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customer = (inv as any).customer as { name?: string; name_ar?: string } | null;

  const input: EtaInvoiceInput = {
    internalId: (inv as { invoice_number: string }).invoice_number,
    issuedAt: new Date(),
    taxpayerActivityCode: settings.taxpayer_activity_code ?? '',
    issuer: {
      type: 'B',
      id: settings.tax_registration_number ?? '',
      name: settings.issuer_name ?? '',
      address: {
        country: addr.country ?? 'EG',
        governate: addr.governate ?? '',
        regionCity: addr.regionCity ?? '',
        street: addr.street ?? '',
        buildingNumber: addr.buildingNumber ?? '',
        branchId: settings.branch_id ?? '0',
      },
    },
    receiver: { type: 'P', name: customer?.name_ar || customer?.name || 'Customer' },
    lines: lines.map((l) => ({
      description: l.product?.name_ar || l.product?.name || l.description || '',
      itemCodeType: (l.product?.eta_item_code_type as 'EGS' | 'GS1') || 'EGS',
      itemCode: l.product?.eta_item_code || '',
      internalCode: l.product?.code || String(l.product_id ?? ''),
      unitType: l.product?.eta_unit_type || 'EA',
      quantity: Number(l.quantity ?? 0),
      unitPrice: Number(l.unit_price ?? 0),
      discountAmount: Number(l.discount_amount ?? 0),
      taxRate: Number(l.tax_rate ?? 0),
    })),
  };

  try {
    const doc = buildEtaDocument(input);
    const signed = await signDocument(doc, getSigner());
    const result = await submitDocuments([signed]);
    const accepted = result.acceptedDocuments?.[0];
    await supabase
      .from('erp_invoices')
      .update({
        eta_status: accepted ? 'submitted' : 'rejected',
        eta_uuid: accepted?.uuid ?? null,
        eta_long_id: accepted?.longId ?? null,
        eta_submission_uuid: result.submissionId ?? null,
        eta_submitted_at: new Date().toISOString(),
        eta_error: accepted ? null : (result.rejectedDocuments?.[0]?.error ?? null),
      })
      .eq('id', id);
    revalidatePath('/sales/invoices');
    return accepted ? { ok: true } : { ok: false, error: t('sales.etaRejected') };
  } catch (e) {
    // Most commonly: signing not configured yet (Phase 2).
    return { ok: false, error: e instanceof Error ? e.message : t('sales.etaSubmitFailed') };
  }
}

export async function recordPayment(input: {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  payment_date?: string;
  idempotency_key?: string;
}): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const { t } = await getT();
  if (!(input.amount > 0)) return { ok: false, error: t('sales.invoiceErrAmountPositive') };

  // Atomic + idempotent: a retry with the same key is a no-op (no double payment).
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_record_payment', {
    p_invoice_id: input.invoice_id,
    p_amount: input.amount,
    p_method: input.payment_method,
    p_ref: input.reference_number ?? null,
    p_date: input.payment_date ?? null,
    p_idempotency_key: input.idempotency_key ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  await emitDomainEvent({ eventType: EVENT.PAYMENT_RECEIVED, entity: 'payment', recordId: input.invoice_id, payload: { amount: input.amount, method: input.payment_method } });
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
