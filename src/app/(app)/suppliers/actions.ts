'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import type { PaymentMethod } from '@/lib/erp/types';

export async function upsertSupplier(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const id = String(formData.get('id') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code) return { ok: false, error: 'كود المورد مطلوب.' };
  if (!name) return { ok: false, error: 'اسم المورد مطلوب.' };

  const payload = {
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    phone: String(formData.get('phone') || '').trim() || null,
    email: String(formData.get('email') || '').trim() || null,
    address: String(formData.get('address') || '').trim() || null,
    city: String(formData.get('city') || '').trim() || null,
    tax_number: String(formData.get('tax_number') || '').trim() || null,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_suppliers').update(payload).eq('id', id)
    : await supabase.from('erp_suppliers').insert(payload);

  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/suppliers');
  return { ok: true };
}

export async function toggleSupplierActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_suppliers')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/suppliers');
  return { ok: true };
}

/**
 * Settle (part of) a supplier balance from a branch's cash. Records the
 * payment, lowers the payable balance, and posts an AP-debit / Cash-credit
 * journal through the chosen branch (which also drives journal numbering).
 */
export async function recordSupplierPayment(input: {
  supplier_id: string;
  branch_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number?: string;
  payment_date?: string;
}): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (!input.branch_id) return { ok: false, error: 'اختر الفرع الذي يصرف المبلغ.' };
  if (!(input.amount > 0)) return { ok: false, error: 'المبلغ يجب أن يكون أكبر من صفر.' };

  const supabase = await createClient();
  const { data: supplier, error: supErr } = await supabase
    .from('erp_suppliers')
    .select('balance')
    .eq('id', input.supplier_id)
    .single();
  if (supErr || !supplier) return { ok: false, error: 'المورد غير موجود.' };

  const paymentDate = input.payment_date || new Date().toISOString().slice(0, 10);
  const { error: payErr } = await supabase.from('erp_supplier_payments').insert({
    supplier_id: input.supplier_id,
    amount: input.amount,
    payment_method: input.payment_method,
    reference_number: input.reference_number?.trim() || null,
    payment_date: paymentDate,
    created_by: ctx!.userId,
  });
  if (payErr) return { ok: false, error: friendlyDbError(payErr) };

  await supabase
    .from('erp_suppliers')
    .update({ balance: Number(supplier.balance) - Number(input.amount) })
    .eq('id', input.supplier_id);

  // Post AP (2100) debit / Cash (1100) credit.
  const { data: accounts } = await supabase
    .from('erp_chart_of_accounts')
    .select('id, code')
    .in('code', ['1100', '2100'])
    .eq('is_system', true);
  const cash = accounts?.find((a) => a.code === '1100');
  const ap = accounts?.find((a) => a.code === '2100');
  if (cash && ap) {
    const { data: jvNumber } = await supabase.rpc('erp_next_number', {
      p_branch_id: input.branch_id,
      p_seq_type: 'journal',
    });
    const { data: entry } = await supabase
      .from('erp_journal_entries')
      .insert({
        entry_number: jvNumber as string,
        entry_date: paymentDate,
        description: 'سداد دفعة لمورد',
        reference_type: 'supplier_payment',
        branch_id: input.branch_id,
        status: 'posted',
        created_by: ctx!.userId,
        posted_by: ctx!.userId,
        posted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (entry) {
      await supabase.from('erp_journal_lines').insert([
        { journal_entry_id: entry.id, account_id: ap.id, debit: input.amount, credit: 0, description: 'موردون - سداد' },
        { journal_entry_id: entry.id, account_id: cash.id, debit: 0, credit: input.amount, description: 'نقدية - سداد' },
      ]);
    }
  }

  revalidatePath('/suppliers');
  return { ok: true };
}
