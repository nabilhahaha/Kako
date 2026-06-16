'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, requireActionPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { isVanSalesActive } from './settings-server';
import { isVanDayOpen } from './day-server';

// ============================================================================
// Van Sales — collection settlement wiring (Phase 5). Completes sell → invoice →
// COLLECT. Reuses the existing collections engine: the pure allocatePayment runs
// in the screen for a live preview, and the atomic erp_settle_collection RPC
// commits (concurrency-safe, idempotent, balance-consistent). This wrapper only
// loads the customer's outstanding invoices and delegates the commit; it never
// moves money itself. Gated by isVanSalesActive (KAKO_VAN_SALES, default OFF).
// ============================================================================

export interface OutstandingInvoiceView {
  id: string;
  invoiceNumber: string;
  outstanding: number;
  date: string; // due date (or created date) — oldest-first ordering key
}

export interface SettleCollectionEntryInput {
  branch_id: string;
  customer_id: string;
  amount: number;
  method?: string;
  reference?: string;
  /** Explicit per-invoice amounts; otherwise oldest-first. */
  specified?: Record<string, number>;
  idempotency_key?: string;
}

const RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authenticated.',
  branch_access_denied: 'You do not have access to this branch.',
  branch_not_found: 'Branch not found.',
  customer_not_found: 'Customer not found.',
  invalid_amount: 'Enter an amount greater than zero.',
};

/** The customer's open invoices (issued / partially-paid / overdue), oldest-first. */
export async function loadCustomerOutstanding(branchId: string, customerId: string): Promise<ActionResult<OutstandingInvoiceView[]>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!branchId || !customerId) return { ok: false, error: 'Branch and customer are required.' };

  const { data, error } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, net_amount, paid_amount, due_date, created_at')
    .eq('branch_id', branchId)
    .eq('customer_id', customerId)
    .in('status', ['issued', 'partially_paid', 'overdue']);
  if (error) return { ok: false, error: friendlyDbError(error) };

  const rows = ((data ?? []) as Array<Record<string, unknown>>)
    .map((r): OutstandingInvoiceView => ({
      id: r.id as string,
      invoiceNumber: r.invoice_number as string,
      outstanding: Number(r.net_amount ?? 0) - Number(r.paid_amount ?? 0),
      date: (r.due_date as string | null) ?? (r.created_at as string),
    }))
    .filter((i) => i.outstanding > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return { ok: true, data: rows };
}

/** Settle a customer collection across outstanding invoices via the atomic RPC. */
export async function settleCollectionEntry(input: SettleCollectionEntryInput): Promise<ActionResult<{ collectionId: string; collectionNumber: string; totalApplied: number; unapplied: number }>> {
  // Always-on money-path authorization (not flag-gated): recording a collection
  // requires the collect permission — mirrors the erp_settle_collection RPC guard.
  const { ctx, error: authErr } = await requireActionPermission('sales.collect');
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!(await isVanDayOpen(ctx.userId))) return { ok: false, error: 'Your day is closed — start a new day before creating transactions.' };
  if (!input.branch_id || !input.customer_id) return { ok: false, error: 'Branch and customer are required.' };
  if (!(input.amount > 0)) return { ok: false, error: RPC_ERRORS.invalid_amount };

  const { data, error } = await supabase.rpc('erp_settle_collection', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_amount: input.amount,
    p_method: input.method ?? 'cash',
    p_reference: input.reference ?? null,
    p_specified: input.specified ?? null,
    p_idempotency_key: input.idempotency_key ?? null,
    p_collection_date: null,
  });
  if (error) return { ok: false, error: RPC_ERRORS[error.message] ?? friendlyDbError(error) };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { collection_id: string; collection_number: string; total_applied: number; unapplied: number }
    | undefined;
  if (!row?.collection_id) return { ok: false, error: 'Collection failed.' };

  await emitDomainEvent({ eventType: EVENT.PAYMENT_RECEIVED, entity: 'payment', recordId: row.collection_id, payload: { amount: input.amount, method: input.method ?? 'cash' } });
  revalidatePath('/customers');
  revalidatePath('/sales/settlement');

  return { ok: true, data: { collectionId: row.collection_id, collectionNumber: row.collection_number, totalApplied: Number(row.total_applied), unapplied: Number(row.unapplied) } };
}
