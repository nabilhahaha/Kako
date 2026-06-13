'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import type { PaymentMethod } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';

export async function upsertSupplier(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();

  const id = String(formData.get('id') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code) return { ok: false, error: t('suppliers.errCodeRequired') };
  if (!name) return { ok: false, error: t('suppliers.errNameRequired') };

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
  const { t } = await getT();
  // MJ-1: supplier payment posts AP/Cash journal — require accounting.post or
  // suppliers.manage (accountant/procurement/admin hold these).
  if (!hasPermission(ctx!, 'accounting.post') && !hasPermission(ctx!, 'suppliers.manage'))
    return { ok: false, error: t('settings.unauthorized') };

  // Atomic via RPC: payment row + supplier balance + AP/Cash journal.
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_record_supplier_payment', {
    p_supplier_id: input.supplier_id,
    p_branch_id: input.branch_id,
    p_amount: input.amount,
    p_method: input.payment_method,
    p_ref: input.reference_number ?? null,
    p_date: input.payment_date ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/suppliers');
  return { ok: true };
}
