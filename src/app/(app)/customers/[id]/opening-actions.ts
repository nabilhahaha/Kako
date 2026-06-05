'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** Set (or replace) a customer's opening balance — previous debt / credit /
 *  installment. Adjusts the running receivable and writes an audit log. */
export async function setCustomerOpeningBalance(
  customerId: string,
  amount: number,
  type: 'debit' | 'credit' | 'installment',
  asOf: string | null,
  note: string | null,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (!customerId) return { ok: false, error: 'العميل غير موجود.' };
  if (!(amount >= 0)) return { ok: false, error: 'المبلغ يجب أن يكون صفرًا أو أكثر.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_set_customer_opening_balance', {
    p_customer_id: customerId,
    p_amount: amount,
    p_type: type,
    p_as_of: asOf,
    p_note: note,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function reverseCustomerOpeningBalance(openingId: string, customerId: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_reverse_customer_opening_balance', { p_id: openingId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}
