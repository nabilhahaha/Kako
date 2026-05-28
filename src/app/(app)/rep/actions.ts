'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { recordPayment } from '../sales/invoices/actions';
import type { PaymentMethod } from '@/lib/erp/types';

/** Rep creates a customer — stays unapproved until a super admin approves it. */
export async function createPendingCustomer(input: {
  branch_id: string;
  code: string;
  name: string;
  phone?: string;
  city?: string;
}): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };

  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) return { ok: false, error: 'كود العميل مطلوب.' };
  if (!name) return { ok: false, error: 'اسم العميل مطلوب.' };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_customers').insert({
    code,
    name,
    name_ar: name,
    phone: input.phone?.trim() || null,
    city: input.city?.trim() || null,
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
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };

  const res = await recordPayment({
    invoice_id: input.invoice_id,
    amount: input.amount,
    payment_method: input.payment_method,
  });
  if (!res.ok) return { ok: false, error: res.error };

  const supabase = await createClient();
  await supabase.from('erp_visits').insert({
    branch_id: input.branch_id,
    customer_id: input.customer_id,
    salesman_id: ctx.userId,
    invoice_id: input.invoice_id,
    no_sale: false,
    notes: 'تحصيل مديونية',
  });

  revalidatePath('/rep');
  return { ok: true, data: { invoice_id: input.invoice_id } };
}
