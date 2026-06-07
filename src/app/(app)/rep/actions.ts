'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';
import { recordPayment } from '../sales/invoices/actions';
import { repDayBlocked, today } from '@/lib/erp/work-session';
import type { PaymentMethod } from '@/lib/erp/types';

/** Open today's work session for the rep. */
export async function startDay(branchId: string): Promise<ActionResult> {
  const { t } = await getT();
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? t('rep.errorUnauthorized') };
  if (!branchId) return { ok: false, error: t('rep.errorBranchRequired') };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('erp_work_sessions')
    .select('status')
    .eq('salesman_id', ctx.userId)
    .eq('work_date', today())
    .maybeSingle();
  if (existing?.status === 'closed') {
    return { ok: false, error: t('rep.errorDayClosed') };
  }
  if (existing) return { ok: true };

  const { error } = await supabase.from('erp_work_sessions').insert({
    branch_id: branchId,
    salesman_id: ctx.userId,
    work_date: today(),
    status: 'open',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/rep');
  return { ok: true };
}

/** Close today's work session — blocks further movements until reopened. */
export async function endDay(): Promise<ActionResult> {
  const { t } = await getT();
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? t('rep.errorUnauthorized') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_work_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('salesman_id', ctx.userId)
    .eq('work_date', today())
    .eq('status', 'open');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/rep');
  return { ok: true };
}

/** Super admin reopens a rep's closed day. */
export async function reopenDay(sessionId: string): Promise<ActionResult> {
  const { t } = await getT();
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: t('rep.errorUnauthorized') };
  if (!ctx.isSuperAdmin) return { ok: false, error: t('rep.errorNotSuperAdmin') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_work_sessions')
    .update({ status: 'open', closed_at: null })
    .eq('id', sessionId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/rep');
  revalidatePath('/sales/settlement');
  return { ok: true };
}

/** Rep creates a customer with full details — stays unapproved until a super
 *  admin reviews/edits and approves it. */
export async function createPendingCustomer(input: {
  branch_id: string;
  code: string;
  name: string;
  name_ar?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  tax_number?: string;
  credit_limit?: number;
  visit_day?: string;
}): Promise<ActionResult> {
  const { t } = await getT();
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? t('rep.errorUnauthorized') };

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return { ok: false, error: t('rep.errorCodeRequired') };
  if (!name) return { ok: false, error: t('rep.errorNameRequired') };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_customers').insert({
    code,
    name,
    name_ar: input.name_ar?.trim() || name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    tax_number: input.tax_number?.trim() || null,
    credit_limit: Number(input.credit_limit) || 0,
    visit_day: input.visit_day?.trim() || null,
    branch_id: input.branch_id || null,
    salesman_id: ctx.userId,
    is_approved: false,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/rep');
  return { ok: true };
}

export interface DebtInvoice {
  id: string;
  invoice_number: string;
  net_amount: number;
  paid_amount: number;
  remaining: number;
  age_days: number;
  created_at: string;
}
export interface CustomerDebt {
  balance: number;
  bucket0_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90: number;
  invoices: DebtInvoice[];
}

/** Open invoices + aging for a customer (for the rep's collection screen). */
export async function getCustomerDebt(customerId: string): Promise<ActionResult<CustomerDebt>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from('erp_customers')
    .select('balance')
    .eq('id', customerId)
    .maybeSingle();

  const { data: invoices } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, net_amount, paid_amount, created_at')
    .eq('customer_id', customerId)
    .in('status', ['issued', 'partially_paid', 'overdue'])
    .order('created_at');

  const now = Date.now();
  const buckets = { b0: 0, b1: 0, b2: 0, b3: 0 };
  const open: DebtInvoice[] = [];
  for (const i of invoices ?? []) {
    const remaining = Number(i.net_amount) - Number(i.paid_amount);
    if (remaining <= 0.001) continue;
    const age = Math.floor((now - new Date(i.created_at).getTime()) / 86400000);
    if (age <= 30) buckets.b0 += remaining;
    else if (age <= 60) buckets.b1 += remaining;
    else if (age <= 90) buckets.b2 += remaining;
    else buckets.b3 += remaining;
    open.push({
      id: i.id,
      invoice_number: i.invoice_number,
      net_amount: Number(i.net_amount),
      paid_amount: Number(i.paid_amount),
      remaining,
      age_days: age,
      created_at: i.created_at,
    });
  }

  return {
    ok: true,
    data: {
      balance: Number(customer?.balance ?? 0),
      bucket0_30: buckets.b0,
      bucket31_60: buckets.b1,
      bucket61_90: buckets.b2,
      bucket90: buckets.b3,
      invoices: open,
    },
  };
}

/** Collect against an existing invoice and log a collection visit. */
export async function collectPayment(input: {
  invoice_id: string;
  branch_id: string;
  customer_id: string;
  amount: number;
  payment_method: PaymentMethod;
}): Promise<ActionResult<{ invoice_id: string }>> {
  const { t } = await getT();
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? t('rep.errorUnauthorized') };

  const blocked = await repDayBlocked(ctx);
  if (blocked) return { ok: false, error: blocked };

  const res = await recordPayment({
    invoice_id: input.invoice_id,
    amount: input.amount,
    payment_method: input.payment_method,
  });
  if (!res.ok) return { ok: false, error: res.error };

  const supabase = await createClient();
  const { data: visit } = await supabase.from('erp_visits').insert({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    salesman_id: ctx.userId,
    invoice_id: input.invoice_id,
    no_sale: false,
    notes: t('rep.notesDebtCollection'),
  }).select('id').single();
  if (visit) await emitDomainEvent({ eventType: EVENT.VISIT_COMPLETED, entity: 'visit', recordId: (visit as { id: string }).id });

  revalidatePath('/rep');
  return { ok: true, data: { invoice_id: input.invoice_id } };
}
