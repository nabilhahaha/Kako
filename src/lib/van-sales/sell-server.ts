'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { isVanSalesActive, loadVanSalesSettings } from './settings-server';
import { normalizeVanSellLines, firstDiscountOverCap, type VanSellLineInput } from './sell';

// ============================================================================
// Van Sell — thin server wrapper (Phase 1, no UI). Validates the request, then
// delegates the WHOLE sale to the erp_van_sell RPC, which is the sole authority
// (server-side pricing, van-required, discount cap, credit limit, negative-stock
// guard, idempotency — all atomic). The wrapper only adds: the enablement gate,
// fast friendly validation, the domain event, and cache revalidation. It never
// computes or passes a price.
// ============================================================================

export interface VanSellInput {
  branch_id: string;
  customer_id: string;
  lines: VanSellLineInput[];
  idempotency_key?: string;
  due_date?: string;
  notes?: string;
}

// Stable RPC error tokens → readable messages. (UI-facing i18n keys are added in
// Phase 2 with the mobile screen; this seam has no UI yet.)
const RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authenticated.',
  branch_access_denied: 'You do not have access to this branch.',
  branch_not_found: 'Branch not found.',
  customer_not_found: 'Customer not found.',
  customer_not_approved: 'This customer is awaiting approval.',
  no_van_assigned: 'No van is assigned to you in this branch — a van sale must come from your van.',
  discount_exceeds_cap: 'A line discount exceeds the allowed cap.',
  over_credit: 'This sale would exceed the customer credit limit.',
  insufficient_van_stock: 'Not enough stock on the van for one or more lines.',
  no_valid_lines: 'Add at least one line with a quantity.',
};

/**
 * Sell off the van: create + issue an invoice against the rep's van in one
 * atomic RPC. Returns the new invoice id. Gated by Van Sales being active for
 * the company (KAKO_VAN_SALES + per-company toggle); a no-op otherwise.
 */
export async function vanSell(input: VanSellInput): Promise<ActionResult<{ id: string; invoiceNumber: string; netAmount: number }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();

  // Enablement gate — Van Sales must be active for this company.
  if (!(await isVanSalesActive(supabase, ctx))) {
    return { ok: false, error: 'Van Sales is not enabled.' };
  }

  if (!input.branch_id) return { ok: false, error: 'Branch is required.' };
  if (!input.customer_id) return { ok: false, error: 'Customer is required.' };

  const lines = normalizeVanSellLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  // Fast discount-cap pre-check (the RPC re-enforces it as the authority).
  if (ctx.companyId) {
    const settings = await loadVanSalesSettings(supabase, ctx.companyId);
    const over = firstDiscountOverCap(lines, settings.discountCapPct);
    if (over) return { ok: false, error: RPC_ERRORS.discount_exceeds_cap };
  }

  const { data, error } = await supabase.rpc('erp_van_sell', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    // Only product / quantity / discount — the price is resolved server-side.
    p_lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, discount_pct: l.discount_pct })),
    p_idempotency_key: input.idempotency_key ?? null,
    p_due_date: input.due_date ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) {
    return { ok: false, error: RPC_ERRORS[error.message] ?? friendlyDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { invoice_id: string; invoice_number: string; net_amount: number }
    | undefined;
  if (!row?.invoice_id) return { ok: false, error: 'Van sale failed.' };

  // Mirror issueInvoice: announce the issued invoice for downstream consumers
  // (finance posting / webhooks). No-op unless KAKO_EVENTS is on.
  await emitDomainEvent({ eventType: EVENT.INVOICE_ISSUED, entity: 'invoice', recordId: row.invoice_id });
  revalidatePath('/sales/invoices');
  revalidatePath('/customers');

  return { ok: true, data: { id: row.invoice_id, invoiceNumber: row.invoice_number, netAmount: Number(row.net_amount) } };
}
