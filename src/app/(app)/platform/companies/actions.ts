'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import type { BusinessType } from '@/lib/erp/types';

async function requirePlatformOwner() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'غير مصرح. سجّل الدخول.' };
  if (!ctx.isPlatformOwner)
    return { ctx: null, error: 'لوحة المزوّد متاحة لمالك المنصّة فقط.' };
  return { ctx, error: null };
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const BUSINESS_TYPES: BusinessType[] = [
  'general', 'supermarket', 'pharmacy', 'wholesale',
  'clothing', 'restaurant', 'cafe', 'services',
];

/** Create a new tenant company with an optional timed subscription. */
export async function createCompany(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };

  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  if (!name) return { ok: false, error: 'اسم الشركة (إنجليزي) مطلوب.' };

  const rawSlug = String(formData.get('slug') || '').trim();
  const slug = rawSlug ? slugify(rawSlug) : slugify(name);
  const btype = String(formData.get('business_type') || 'general') as BusinessType;
  const business_type = BUSINESS_TYPES.includes(btype) ? btype : 'general';
  const subscription_start = String(formData.get('subscription_start') || '').trim() || null;
  const subscription_end = String(formData.get('subscription_end') || '').trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_companies')
    .insert({
      name,
      name_ar,
      slug: slug || null,
      business_type,
      subscription_start,
      subscription_end,
      currency: 'EGP',
      is_active: true,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'المعرّف (slug) مستخدم بالفعل.' };
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/platform/companies');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/** Update a company's profile + subscription settings. */
export async function updateCompany(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };

  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: 'الشركة مطلوبة.' };
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'اسم الشركة (إنجليزي) مطلوب.' };

  const btype = String(formData.get('business_type') || 'general') as BusinessType;
  const business_type = BUSINESS_TYPES.includes(btype) ? btype : 'general';

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_companies')
    .update({
      name,
      name_ar: String(formData.get('name_ar') || '').trim() || null,
      business_type,
      subscription_start: String(formData.get('subscription_start') || '').trim() || null,
      subscription_end: String(formData.get('subscription_end') || '').trim() || null,
    })
    .eq('id', id);

  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Suspend or re-activate a tenant (manual lock, independent of expiry). */
export async function setCompanyActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_companies').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Renew/extend a subscription to a new end date. */
export async function setSubscriptionEnd(id: string, end: string): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  if (!end) return { ok: false, error: 'تاريخ الانتهاء مطلوب.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_companies')
    .update({ subscription_end: end, is_active: true })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/platform/companies');
  revalidatePath(`/platform/companies/${id}`);
  return { ok: true };
}

/** Add a branch to a tenant company. */
export async function addBranch(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };

  const company_id = String(formData.get('company_id') || '').trim();
  const code = String(formData.get('code') || '').trim().toUpperCase();
  const name = String(formData.get('name') || '').trim();
  if (!company_id) return { ok: false, error: 'الشركة مطلوبة.' };
  if (!code) return { ok: false, error: 'كود الفرع مطلوب.' };
  if (!name) return { ok: false, error: 'اسم الفرع مطلوب.' };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_branches').insert({
    company_id,
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    is_hq: formData.get('is_hq') === 'on',
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'كود الفرع مستخدم بالفعل في هذه الشركة.' };
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath(`/platform/companies/${company_id}`);
  return { ok: true };
}

/**
 * Onboard a tenant admin: create the auth user (via the edge function) and
 * assign them to a branch of the company as its admin.
 */
export async function onboardAdmin(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };

  const company_id = String(formData.get('company_id') || '').trim();
  const branch_id = String(formData.get('branch_id') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const full_name = String(formData.get('full_name') || '').trim();
  const role = String(formData.get('role') || 'admin').trim() || 'admin';

  if (!company_id) return { ok: false, error: 'الشركة مطلوبة.' };
  if (!branch_id) return { ok: false, error: 'اختر الفرع لربط المستخدم به.' };
  if (!email) return { ok: false, error: 'البريد الإلكتروني مطلوب.' };
  if (password.length < 6) return { ok: false, error: 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.' };

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, full_name },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });

  if (error)
    return { ok: false, error: 'تعذّر إنشاء المستخدم. تأكد من نشر دالة admin-create-user.' };
  if (data?.error) return { ok: false, error: data.error };
  const userId = data?.user_id as string | undefined;
  if (!userId) return { ok: false, error: 'تعذّر الحصول على معرّف المستخدم.' };

  const { error: assignErr } = await supabase
    .from('erp_user_branches')
    .upsert(
      { user_id: userId, branch_id, role, is_default: true },
      { onConflict: 'user_id,branch_id' },
    );
  if (assignErr) return { ok: false, error: friendlyDbError(assignErr) };

  revalidatePath(`/platform/companies/${company_id}`);
  return { ok: true };
}
