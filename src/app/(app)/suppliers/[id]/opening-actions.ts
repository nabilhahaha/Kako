'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** Set (or replace) a supplier's opening balance — previous payable / advance.
 *  Adjusts the running payable and writes an audit log. */
export async function setSupplierOpeningBalance(
  supplierId: string,
  amount: number,
  type: 'credit' | 'debit',
  asOf: string | null,
  note: string | null,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (!supplierId) return { ok: false, error: 'المورد غير موجود.' };
  if (!(amount >= 0)) return { ok: false, error: 'المبلغ يجب أن يكون صفرًا أو أكثر.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_set_supplier_opening_balance', {
    p_supplier_id: supplierId,
    p_amount: amount,
    p_type: type,
    p_as_of: asOf,
    p_note: note,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

export async function reverseSupplierOpeningBalance(openingId: string, supplierId: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_reverse_supplier_opening_balance', { p_id: openingId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}
