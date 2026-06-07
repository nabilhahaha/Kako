'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, can, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { type LineInput } from '@/lib/erp/sales-calc';
import { createInvoiceCore, issueInvoiceCore, recordPaymentCore } from '@/lib/erp/sales/invoice-core';
import { recordEvent } from '@/lib/workflow/emit';
import { EVENT } from '@/lib/workflow/event-types';
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
  const supabase = await createClient();
  const res = await createInvoiceCore(supabase, { userId: ctx!.userId, companyId: ctx!.companyId }, t, input);
  if (res.ok) revalidatePath('/sales/invoices');
  return res;
}

/**
 * Issue a draft invoice: deduct stock from the branch warehouse and flip the
 * status to 'issued', which fires the DB trigger that posts the AR/Revenue
 * journal entry. Also increases the customer's outstanding balance.
 */
export async function issueInvoice(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  const supabase = await createClient();
  const res = await issueInvoiceCore(supabase, t, id);
  if (res.ok) {
    await recordEvent({ eventType: EVENT.INVOICE_ISSUED, entity: 'invoice', recordId: id });
    revalidatePath('/sales/invoices'); revalidatePath('/customers');
  }
  return res;
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
  const supabase = await createClient();
  const res = await recordPaymentCore(supabase, t, input);
  if (res.ok) {
    await recordEvent({ eventType: EVENT.PAYMENT_RECEIVED, entity: 'payment', recordId: input.idempotency_key ?? input.invoice_id, payload: { invoice_id: input.invoice_id, amount: input.amount, payment_method: input.payment_method } });
    revalidatePath('/sales/invoices'); revalidatePath('/customers');
  }
  return res;
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

/**
 * Void an ISSUED (unpaid, un-returned) invoice. Manager-only (`sales.void`) and a
 * reason is mandatory. The RPC reverses stock, the AR/Revenue journal, the
 * customer balance, and any unpaid installment plan, preserves the invoice as
 * 'cancelled' with a void trail, and writes an audit log. Paid/returned invoices
 * are blocked by the RPC and must be reversed via the returns/refund workflow.
 */
export async function voidInvoice(id: string, reason: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!can(ctx!, 'sales.void')) return { ok: false, error: t('sales.voidErrNoPermission') };
  if (!reason || !reason.trim()) return { ok: false, error: t('sales.voidErrReasonRequired') };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_void_invoice', { p_invoice_id: id, p_reason: reason.trim() });
  if (error) return { ok: false, error: friendlyDbError(error) };

  await recordEvent({ eventType: EVENT.INVOICE_VOIDED, entity: 'invoice', recordId: id, payload: { reason: reason.trim() } });
  revalidatePath('/sales/invoices');
  revalidatePath('/customers');
  revalidatePath('/inventory');
  return { ok: true };
}
