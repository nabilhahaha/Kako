'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export async function upsertCustomer(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const id = String(formData.get('id') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code) return { ok: false, error: 'كود العميل مطلوب.' };
  if (!name) return { ok: false, error: 'اسم العميل مطلوب.' };

  const branchId = String(formData.get('branch_id') || '').trim();
  const salesmanId = String(formData.get('salesman_id') || '').trim();
  const visitDay = String(formData.get('visit_day') || '').trim();
  const payload = {
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    phone: String(formData.get('phone') || '').trim() || null,
    email: String(formData.get('email') || '').trim() || null,
    address: String(formData.get('address') || '').trim() || null,
    city: String(formData.get('city') || '').trim() || null,
    tax_number: String(formData.get('tax_number') || '').trim() || null,
    credit_limit: num(formData.get('credit_limit')),
    branch_id: branchId || null,
    salesman_id: salesmanId || null,
    visit_day: visitDay || null,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_customers').update(payload).eq('id', id)
    : await supabase.from('erp_customers').insert(payload);

  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  return { ok: true };
}

interface ImportRow {
  code: string;
  name: string;
  name_ar?: string;
  phone?: string;
  city?: string;
  credit_limit?: number;
}

/** Bulk import customers (from a parsed Excel/CSV), upserting on code. */
export async function importCustomers(
  rows: ImportRow[],
  branchId: string | null,
  salesmanId: string | null,
): Promise<ActionResult<{ count: number }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const clean = rows
    .map((r) => ({
      code: String(r.code ?? '').trim(),
      name: String(r.name ?? '').trim(),
      name_ar: r.name_ar?.toString().trim() || null,
      phone: r.phone?.toString().trim() || null,
      city: r.city?.toString().trim() || null,
      credit_limit: Number(r.credit_limit) || 0,
      branch_id: branchId || null,
      salesman_id: salesmanId || null,
    }))
    .filter((r) => r.code && r.name);

  if (clean.length === 0) return { ok: false, error: 'لا توجد صفوف صالحة (الكود والاسم مطلوبان).' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .upsert(clean, { onConflict: 'code' });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/customers');
  return { ok: true, data: { count: clean.length } };
}

/** Assign a salesman and/or visit day to a customer (journey plan). */
export async function setCustomerJourney(
  id: string,
  salesmanId: string | null,
  visitDay: string | null,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .update({ salesman_id: salesmanId || null, visit_day: visitDay || null })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  revalidatePath('/sales/journey');
  return { ok: true };
}

/** Super admin approves a rep-created customer so it can be sold to. */
export async function approveCustomer(id: string): Promise<ActionResult> {
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'غير مصرح.' };
  if (!ctx.isSuperAdmin) return { ok: false, error: 'الاعتماد متاح لمدير النظام فقط.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .update({ is_approved: true })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  return { ok: true };
}

export async function toggleCustomerActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  return { ok: true };
}
