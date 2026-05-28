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
 * Post a voucher: generate its journal entry and mark it posted.
 * Payment voucher → Debit chosen account (expense), Credit Cash.
 * Receipt voucher → Debit Cash, Credit chosen account (revenue).
 */
export async function postVoucher(kind: VoucherKind, id: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { data: voucher, error: vErr } = await supabase
    .from(TABLE[kind])
    .select('*')
    .eq('id', id)
    .single();
  if (vErr || !voucher) return { ok: false, error: 'السند غير موجود.' };
  if (voucher.status === 'posted') return { ok: false, error: 'تم ترحيل السند بالفعل.' };
  if (voucher.status === 'cancelled') return { ok: false, error: 'السند ملغي.' };

  const { data: cash } = await supabase
    .from('erp_chart_of_accounts')
    .select('id')
    .eq('code', '1100')
    .eq('is_system', true)
    .single();
  if (!cash) return { ok: false, error: 'حساب النقدية غير موجود.' };

  const { data: jvNumber } = await supabase.rpc('erp_next_number', {
    p_branch_id: voucher.branch_id,
    p_seq_type: 'journal',
  });
  const { data: entry, error: entryErr } = await supabase
    .from('erp_journal_entries')
    .insert({
      entry_number: jvNumber as string,
      entry_date: voucher.voucher_date,
      description:
        kind === 'payment'
          ? `سند صرف ${voucher.voucher_number} - ${voucher.payee}`
          : `سند قبض ${voucher.voucher_number} - ${voucher.payer}`,
      reference_type: kind === 'payment' ? 'payment_voucher' : 'receipt_voucher',
      reference_id: id,
      branch_id: voucher.branch_id,
      status: 'posted',
      created_by: ctx!.userId,
      posted_by: ctx!.userId,
      posted_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (entryErr) return { ok: false, error: friendlyDbError(entryErr) };

  const lines =
    kind === 'payment'
      ? [
          { journal_entry_id: entry.id, account_id: voucher.account_id, debit: voucher.amount, credit: 0 },
          { journal_entry_id: entry.id, account_id: cash.id, debit: 0, credit: voucher.amount },
        ]
      : [
          { journal_entry_id: entry.id, account_id: cash.id, debit: voucher.amount, credit: 0 },
          { journal_entry_id: entry.id, account_id: voucher.account_id, debit: 0, credit: voucher.amount },
        ];
  const { error: linesErr } = await supabase.from('erp_journal_lines').insert(lines);
  if (linesErr) return { ok: false, error: friendlyDbError(linesErr) };

  await supabase
    .from(TABLE[kind])
    .update({ status: 'posted', approved_by: ctx!.userId })
    .eq('id', id);

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
