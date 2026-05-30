'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireSuperAdmin() {
  const ctx = await getUserContext();
  const { t } = await getT();
  if (!ctx) return { ctx: null, error: t('settings.unauthorizedLogin') };
  if (!ctx.isSuperAdmin)
    return { ctx: null, error: t('settings.branches.superAdminOnlyAction') };
  return { ctx, error: null };
}

export async function createCompany(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };

  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  const { t: t2 } = await getT();
  if (!name) return { ok: false, error: t2('settings.company.errNameRequired') };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_companies').insert({
    name,
    name_ar,
    tax_number: String(formData.get('tax_number') || '').trim() || null,
    phone: String(formData.get('phone') || '').trim() || null,
    currency: 'EGP',
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/branches');
  return { ok: true };
}

export async function upsertBranch(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };

  const id = String(formData.get('id') || '').trim();
  const company_id = String(formData.get('company_id') || '').trim();
  const code = String(formData.get('code') || '').trim().toUpperCase();
  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  const city = String(formData.get('city') || '').trim() || null;
  const phone = String(formData.get('phone') || '').trim() || null;
  const address = String(formData.get('address') || '').trim() || null;
  const is_hq = formData.get('is_hq') === 'on';

  const { t: t3 } = await getT();
  if (!company_id) return { ok: false, error: t3('settings.branches.errCompanyRequired') };
  if (!code) return { ok: false, error: t3('settings.branches.errCodeRequired') };
  if (!name) return { ok: false, error: t3('settings.branches.errNameRequired') };

  const supabase = await createClient();
  const payload = { company_id, code, name, name_ar, city, phone, address, is_hq };

  const { error } = id
    ? await supabase.from('erp_branches').update(payload).eq('id', id)
    : await supabase.from('erp_branches').insert(payload);

  if (error) {
    if (error.code === '23505')
      return { ok: false, error: t3('settings.branches.errCodeDuplicate') };
    return { ok: false, error: error.message };
  }
  revalidatePath('/settings/branches');
  return { ok: true };
}

export async function toggleBranchActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_branches')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/branches');
  return { ok: true };
}
