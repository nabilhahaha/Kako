import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCustomerStatement,
  type CustomerStatement,
  type RawInvoice,
  type RawCollection,
  type RawPayment,
  type RawCreditNote,
} from './customer-statement';

/**
 * THE authoritative customer-statement loader. Every surface — the statement
 * screen (salesman / supervisor / admin), the print/PDF page, aging, open
 * invoices, the summary and Collect-Now — calls this one function so they can
 * never diverge. Read-only; RLS-scoped by the caller's client. Credits come from
 * erp_collections (applied) + legacy erp_payments + erp_credit_notes, so the
 * closing balance reconciles to erp_customers.balance.
 */
export interface CustomerStatementResult {
  customer: {
    id: string; name: string; name_ar: string | null; code: string; phone: string | null;
    credit_limit: number; balance: number; payment_terms_days: number | null;
    credit_control_enabled: boolean | null; customer_status: string | null;
  };
  statement: CustomerStatement;
}

export async function loadCustomerStatement(
  supabase: SupabaseClient,
  customerId: string,
  opts?: { from?: string; to?: string; today?: string },
): Promise<CustomerStatementResult | null> {
  const { data: cust } = await supabase
    .from('erp_customers')
    .select('id, name, name_ar, code, phone, credit_limit, balance, payment_terms_days, credit_control_enabled, customer_status')
    .eq('id', customerId)
    .maybeSingle();
  if (!cust) return null;
  const c = cust as CustomerStatementResult['customer'];

  const { data: invRows } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, net_amount, paid_amount, status, due_date, created_at')
    .eq('customer_id', customerId)
    .neq('status', 'draft')
    .neq('status', 'cancelled');
  const invoices = ((invRows ?? []) as RawInvoice[]);
  const invoiceIds = invoices.map((i) => i.id);
  const invNumberById = new Map(invoices.map((i) => [i.id, i.invoice_number]));

  // Collections (FMCG / van-sales + standalone Collect) — the real payment source.
  const { data: colRows } = await supabase
    .from('erp_collections')
    .select('collection_number, collection_date, method, applied_amount, unapplied_amount')
    .eq('customer_id', customerId);
  const collections = ((colRows ?? []) as RawCollection[]);

  // Legacy desktop payments + credit notes (returns), linked via the invoice.
  let payments: RawPayment[] = [];
  let creditNotes: RawCreditNote[] = [];
  if (invoiceIds.length > 0) {
    const [{ data: payRows }, { data: cnRows }] = await Promise.all([
      supabase.from('erp_payments').select('amount, payment_method, payment_date, invoice_id').in('invoice_id', invoiceIds),
      supabase.from('erp_credit_notes').select('credit_note_number, amount, created_at, invoice_id, status').in('invoice_id', invoiceIds),
    ]);
    payments = ((payRows ?? []) as Array<{ amount: number; payment_method: string; payment_date: string; invoice_id: string }>)
      .map((p) => ({ amount: p.amount, payment_method: p.payment_method, payment_date: p.payment_date, invoice_number: invNumberById.get(p.invoice_id) ?? null }));
    creditNotes = ((cnRows ?? []) as Array<{ credit_note_number: string | number; amount: number; created_at: string; status: string | null }>)
      .filter((n) => n.status !== 'cancelled' && n.status !== 'draft')
      .map((n) => ({ credit_note_number: n.credit_note_number, amount: n.amount, created_at: n.created_at }));
  }

  const statement = buildCustomerStatement({
    customer: { credit_limit: c.credit_limit, balance: c.balance, payment_terms_days: c.payment_terms_days },
    invoices, collections, payments, creditNotes,
    todayISO: (opts?.today ?? new Date().toISOString()).slice(0, 10),
    range: opts?.from || opts?.to ? { from: opts?.from, to: opts?.to } : undefined,
  });

  return { customer: c, statement };
}
