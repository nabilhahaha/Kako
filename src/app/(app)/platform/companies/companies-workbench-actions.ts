'use server';

import { createClient } from '@/lib/supabase/server';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { loadCompanyTabData, type CompanyTabData } from './companies-workbench-server';

/** Load one company's tab data for the workbench. Platform-gated (view_companies);
 *  read-only. */
export async function loadCompanyTabDataAction(
  companyId: string,
): Promise<{ ok: true; data: CompanyTabData } | { ok: false; error: string }> {
  const pctx = await getPlatformContext();
  if (!hasPlatformPermission(pctx, 'view_companies')) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const data = await loadCompanyTabData(supabase, companyId);
  if (!data) return { ok: false, error: 'not_found' };
  return { ok: true, data };
}
