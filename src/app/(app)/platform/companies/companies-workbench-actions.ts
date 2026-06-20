'use server';

import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { loadCompanyDetailBundle, type CompanyDetailBundle } from './[id]/load';

/** Load one company's FULL detail bundle (the Company360 view) for the workbench.
 *  Platform-gated (view_companies); read-only. */
export async function loadCompanyDetailBundleAction(
  companyId: string,
): Promise<{ ok: true; data: CompanyDetailBundle } | { ok: false; error: string }> {
  const pctx = await getPlatformContext();
  if (!hasPlatformPermission(pctx, 'view_companies')) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { locale } = await getT();
  const data = await loadCompanyDetailBundle(supabase, companyId, locale);
  if (!data) return { ok: false, error: 'not_found' };
  return { ok: true, data };
}
