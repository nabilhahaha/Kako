'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const s = (v: FormDataEntryValue | null) => String(v ?? '').trim() || null;

export async function saveEtaSettings(formData: FormData): Promise<ActionResult> {
  const ctx = await getUserContext();
  const { t } = await getT();
  if (!ctx) return { ok: false, error: t('settings.unauthorizedLogin') };
  if (!ctx.isSuperAdmin) return { ok: false, error: t('settings.branches.superAdminOnlyAction') };
  if (!ctx.companyId) return { ok: false, error: t('settings.eta.errNoCompany') };

  const environment = String(formData.get('environment') || 'preprod');
  const payload = {
    company_id: ctx.companyId,
    tax_registration_number: s(formData.get('tax_registration_number')),
    taxpayer_activity_code: s(formData.get('taxpayer_activity_code')),
    branch_id: String(formData.get('branch_id') || '0').trim() || '0',
    issuer_name: s(formData.get('issuer_name')),
    environment: environment === 'production' ? 'production' : 'preprod',
    enabled: formData.get('enabled') === 'on',
    address: {
      country: s(formData.get('country')) ?? 'EG',
      governate: s(formData.get('governate')) ?? '',
      regionCity: s(formData.get('regionCity')) ?? '',
      street: s(formData.get('street')) ?? '',
      buildingNumber: s(formData.get('buildingNumber')) ?? '',
    },
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_company_eta_settings')
    .upsert(payload, { onConflict: 'company_id' });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/einvoice');
  return { ok: true };
}
