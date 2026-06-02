'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { computeLine, computeTotals, type LineInput } from '@/lib/erp/sales-calc';
import { logPriceOverrides } from '@/lib/erp/pricing-server';
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
