'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, canAny, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

const STORE_MANAGE = ['settings.users', 'settings.branches', 'fashion.manage'];

function str(v: FormDataEntryValue | null): string | null {
  return String(v ?? '').trim() || null;
}

/** Update the store's own company profile (retail Store Information). Tenant-scoped,
 *  audited. Only the store's own company row — never any platform/tenant admin. */
export async function updateStore(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!canAny(ctx!, STORE_MANAGE)) return { ok: false, error: t('settings.store.errNoPermission') };
  if (!ctx!.companyId) return { ok: false, error: t('settings.store.errNoCompany') };

  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('settings.store.errNameRequired') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_companies')
    .update({
      name,
      name_ar: str(formData.get('name_ar')),
      phone: str(formData.get('phone')),
      email: str(formData.get('email')),
      address: str(formData.get('address')),
      tax_number: str(formData.get('tax_number')),
      cr_number: str(formData.get('cr_number')),
      logo_url: str(formData.get('logo_url')),
      website: str(formData.get('website')),
      currency: String(formData.get('currency') || 'EGP').trim() || 'EGP',
    })
    .eq('id', ctx!.companyId);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, { action: 'store.updated', entity: 'erp_companies', entityId: ctx!.companyId, details: { name }, companyId: ctx!.companyId });
  revalidatePath('/settings/store');
  return { ok: true };
}
