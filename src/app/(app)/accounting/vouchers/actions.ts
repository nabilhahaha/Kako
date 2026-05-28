'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

export type VoucherKind = 'payment' | 'receipt';

const TABLE: Record<VoucherKind, string> = {
  payment: 'erp_payment_vouchers',
  receipt: 'erp_receipt_vouchers',
};
const SEQ: Record<VoucherKind, string> = {
  payment: 'payment_voucher',
  receipt: 'receipt_voucher',
};

export async function createVoucher(
  kind: VoucherKind,
  input: {
    branch_id: string;
    account_id: string;
    party: string; // payee (payment) or payer (receipt)
    amount: number;
    voucher_date?: string;
    notes?: string;
  },
): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  if (!input.branch_id) return { ok: false, error: 'الفرع مطلوب.' };
  if (!input.account_id) return { ok: false, error: 'الحساب مطلوب.' };
  if (!input.party.trim())
    return { ok: false, error: kind === 'payment' ? 'اسم المستفيد مطلوب.' : 'اسم الدافع مطلوب.' };
  if (!(input.amount > 0)) return { ok: false, error: 'المبلغ يجب أن يكون أكبر من صفر.' };

  const supabase = await createClient();
  const { data: number, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: SEQ[kind],
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const partyField = kind === 'payment' ? 'payee' : 'payer';
  const { error } = await supabase.from(TABLE[kind]).insert({
    voucher_number: number as string,
    voucher_date: input.voucher_date || new Date().toISOString().slice(0, 10),
    [partyField]: input.party.trim(),
    amount: input.amount,
    account_id: input.account_id,
    branch_id: input.branch_id,
    notes: input.notes?.trim() || null,
    status: 'draft',
    created_by: ctx!.userId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/accounting/vouchers');
  return { ok: true };
}

/**
 * Post a voucher and generate its balanced journal entry, atomically via RPC.
 * Payment voucher → Debit chosen account (expense), Credit Cash.
 * Receipt voucher → Debit Cash, Credit chosen account (revenue).
 */
export async function postVoucher(kind: VoucherKind, id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const fn = kind === 'payment' ? 'erp_post_payment_voucher' : 'erp_post_receipt_voucher';
  const { error } = await supabase.rpc(fn, { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/accounting/vouchers');
  revalidatePath('/accounting/journal');
  return { ok: true };
}

export async function cancelVoucher(kind: VoucherKind, id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from(TABLE[kind])
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['draft', 'approved']);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/accounting/vouchers');
  return { ok: true };
}
