'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, requireActionPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { isVanSalesActive } from './settings-server';
import { isVanDayOpen } from './day-server';
import { normalizeReturnLines, computeReturnTotal, type ReturnLineInput, type PricedReturnLine } from './returns';

// ============================================================================
// Van Return — thin server wrapper (Phase 3, optional thin UI). Validates the
// request then delegates the WHOLE return to erp_van_return, the sole authority
// (return-to-van, mandatory reason, server-side pricing, optional credit note,
// audit, idempotency — all atomic). The wrapper adds the enablement gate, a
// read-only price preview, the domain event, and revalidation. It never prices.
// ============================================================================

export interface VanReturnInput {
  branch_id: string;
  customer_id: string;
  reason_id: string;
  lines: ReturnLineInput[];
  invoice_id?: string;
  create_credit_note?: boolean;
  notes?: string;
  idempotency_key?: string;
}

export interface VanReturnPreview { lines: PricedReturnLine[]; total: number }

const RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authenticated.',
  branch_access_denied: 'You do not have access to this branch.',
  branch_not_found: 'Branch not found.',
  customer_not_found: 'Customer not found.',
  reason_required: 'A return reason is required.',
  invalid_reason: 'That return reason is not valid for this company.',
  no_van_assigned: 'No van is assigned to you — a van return must go to your van.',
  invoice_mismatch: 'The selected invoice does not belong to this customer.',
  no_valid_lines: 'Add at least one line with a quantity.',
};

/** Resolve the credited price of each line server-side (original invoice line if
 *  given, else current resolved price) for the review step. Creates nothing. */
export async function previewVanReturn(input: { branch_id: string; customer_id: string; invoice_id?: string; lines: ReturnLineInput[] }): Promise<ActionResult<VanReturnPreview>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!input.branch_id || !input.customer_id) return { ok: false, error: 'Branch and customer are required.' };

  const lines = normalizeReturnLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  // Original invoice prices, if an invoice is referenced.
  const invoicePrice = new Map<string, number>();
  if (input.invoice_id) {
    const { data } = await supabase
      .from('erp_invoice_lines')
      .select('product_id, unit_price')
      .eq('invoice_id', input.invoice_id);
    for (const r of (data ?? []) as { product_id: string; unit_price: number }[]) invoicePrice.set(r.product_id, Number(r.unit_price));
  }

  const priced: PricedReturnLine[] = [];
  for (const l of lines) {
    let unit = invoicePrice.get(l.product_id);
    if (unit == null) {
      const { data: pr, error } = await supabase.rpc('erp_resolve_price', {
        p_product_id: l.product_id, p_customer_id: input.customer_id, p_branch_id: input.branch_id, p_qty: l.quantity,
      });
      if (error) return { ok: false, error: friendlyDbError(error) };
      const row = (Array.isArray(pr) ? pr[0] : pr) as { price: number } | undefined;
      unit = Number(row?.price ?? 0);
    }
    priced.push({ product_id: l.product_id, quantity: l.quantity, unit_price: unit });
  }

  return { ok: true, data: { lines: priced, total: computeReturnTotal(priced) } };
}

/** Accept a return back to the rep's van in one atomic RPC. Returns the return id
 *  + optional credit-note id. Gated by Van Sales being active for the company. */
export async function vanReturn(input: VanReturnInput): Promise<ActionResult<{ id: string; returnNumber: string; creditNoteId: string | null; totalAmount: number }>> {
  // Always-on money-path authorization (not flag-gated): committing a van return
  // requires the field-sales permission — mirrors the erp_van_return RPC guard.
  const { ctx, error: authErr } = await requireActionPermission('field.sales');
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!(await isVanDayOpen(ctx.userId))) return { ok: false, error: 'Your day is closed — start a new day before creating transactions.' };
  if (!input.branch_id) return { ok: false, error: 'Branch is required.' };
  if (!input.customer_id) return { ok: false, error: 'Customer is required.' };
  if (!input.reason_id) return { ok: false, error: RPC_ERRORS.reason_required };

  const lines = normalizeReturnLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  // Invoice-anchored return: never let a line exceed what's still returnable
  // (sold − previously returned) on the selected invoice. Server-authoritative;
  // the UI caps too, but this is the guard. A product not on the invoice ⇒ 0.
  if (input.invoice_id) {
    const remaining = await invoiceRemainingMap(supabase, input.invoice_id);
    for (const l of lines) {
      const rem = remaining.get(l.product_id)?.remaining ?? 0;
      if (l.quantity > rem + 1e-6) return { ok: false, error: RETURN_EXCEEDS };
    }
  }

  const { data, error } = await supabase.rpc('erp_van_return', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_lines: lines,
    p_reason_id: input.reason_id,
    p_invoice_id: input.invoice_id ?? null,
    p_create_credit_note: input.create_credit_note ?? false,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotency_key ?? null,
  });
  if (error) return { ok: false, error: RPC_ERRORS[error.message] ?? friendlyDbError(error) };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { return_id: string; return_number: string; credit_note_id: string | null; total_amount: number }
    | undefined;
  if (!row?.return_id) return { ok: false, error: 'Van return failed.' };

  await emitDomainEvent({ eventType: EVENT.RETURN_APPROVED, entity: 'return', recordId: row.return_id });
  revalidatePath('/sales/returns');
  revalidatePath('/customers');

  return { ok: true, data: { id: row.return_id, returnNumber: row.return_number, creditNoteId: row.credit_note_id, totalAmount: Number(row.total_amount) } };
}

// ============================================================================
// Invoice-anchored return: pick an invoice → its items with Sold / Previously
// returned / Remaining returnable. Read-only loaders for the screen; the cap is
// enforced both here (vanReturn guard) and in the UI. No transaction change.
// ============================================================================

const RETURN_EXCEEDS = 'You cannot return more than the remaining returnable quantity.';

export interface ReturnableInvoice { id: string; invoiceNumber: string; date: string; net: number }
export interface ReturnLineRow {
  productId: string; name: string; name_ar: string | null; code: string;
  sold: number; returned: number; remaining: number; unitPrice: number;
}

/** Per-product Sold / previously-returned / remaining for one invoice. */
async function invoiceRemainingMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, invoiceId: string,
): Promise<Map<string, { sold: number; returned: number; remaining: number; unitPrice: number }>> {
  const map = new Map<string, { sold: number; returned: number; remaining: number; unitPrice: number }>();
  const { data: ilines } = await supabase.from('erp_invoice_lines').select('product_id, quantity, unit_price').eq('invoice_id', invoiceId);
  for (const r of (ilines ?? []) as { product_id: string; quantity: number; unit_price: number }[]) {
    const e = map.get(r.product_id) ?? { sold: 0, returned: 0, remaining: 0, unitPrice: Number(r.unit_price ?? 0) };
    e.sold += Number(r.quantity ?? 0);
    e.unitPrice = Number(r.unit_price ?? 0);
    map.set(r.product_id, e);
  }
  const { data: rets } = await supabase.from('erp_sales_returns').select('id').eq('invoice_id', invoiceId).eq('status', 'completed');
  const retIds = ((rets ?? []) as { id: string }[]).map((r) => r.id);
  if (retIds.length > 0) {
    const { data: rl } = await supabase.from('erp_sales_return_lines').select('product_id, quantity').in('return_id', retIds);
    for (const r of (rl ?? []) as { product_id: string; quantity: number }[]) {
      const e = map.get(r.product_id);
      if (e) e.returned += Number(r.quantity ?? 0);
    }
  }
  for (const e of map.values()) e.remaining = Math.max(0, e.sold - e.returned);
  return map;
}

/** The customer's invoices eligible for return (non-draft, non-cancelled), newest first. */
export async function loadReturnableInvoices(branchId: string, customerId: string): Promise<ActionResult<ReturnableInvoice[]>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!branchId || !customerId) return { ok: false, error: 'Branch and customer are required.' };

  const { data, error } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, created_at, net_amount, status')
    .eq('branch_id', branchId).eq('customer_id', customerId)
    .in('status', ['issued', 'paid', 'partially_paid', 'overdue'])
    .order('created_at', { ascending: false }).limit(100);
  if (error) return { ok: false, error: friendlyDbError(error) };

  const rows = ((data ?? []) as { id: string; invoice_number: string; created_at: string; net_amount: number }[])
    .map((r) => ({ id: r.id, invoiceNumber: r.invoice_number, date: String(r.created_at).slice(0, 10), net: Number(r.net_amount ?? 0) }));
  return { ok: true, data: rows };
}

/** The selected invoice's items with Sold / Previously returned / Remaining. */
export async function loadInvoiceReturnLines(invoiceId: string): Promise<ActionResult<ReturnLineRow[]>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!invoiceId) return { ok: false, error: 'Invoice is required.' };

  const map = await invoiceRemainingMap(supabase, invoiceId);
  const ids = [...map.keys()];
  if (ids.length === 0) return { ok: true, data: [] };

  const { data: prods } = await supabase.from('erp_products_catalog').select('id, name, name_ar, code').in('id', ids);
  const pById = new Map(((prods ?? []) as { id: string; name: string; name_ar: string | null; code: string }[]).map((p) => [p.id, p]));

  const rows: ReturnLineRow[] = ids.map((id) => {
    const e = map.get(id)!;
    const p = pById.get(id);
    return { productId: id, name: p?.name ?? id, name_ar: p?.name_ar ?? null, code: p?.code ?? '', sold: e.sold, returned: e.returned, remaining: e.remaining, unitPrice: e.unitPrice };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: rows };
}
