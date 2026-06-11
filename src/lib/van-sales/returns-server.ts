'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { isVanSalesActive } from './settings-server';
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
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!input.branch_id) return { ok: false, error: 'Branch is required.' };
  if (!input.customer_id) return { ok: false, error: 'Customer is required.' };
  if (!input.reason_id) return { ok: false, error: RPC_ERRORS.reason_required };

  const lines = normalizeReturnLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

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
