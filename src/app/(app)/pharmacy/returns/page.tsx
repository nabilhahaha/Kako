import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import type { Branch, ErpCustomer } from '@/lib/erp/types';
import { ReturnsManager } from './returns-manager';

export const dynamic = 'force-dynamic';

/** Batch-aware pharmacy returns — restock the specific batch (FEFO/expiry safe). */
export default async function PharmacyReturnsPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('sales.return') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.batch_aware_returns'] !== true) redirect('/pharmacy/dashboard');

  const [{ data: branches }, { data: customers }] = await Promise.all([
    supabase.from('erp_branches').select('id, name, name_ar').eq('is_active', true).order('code'),
    supabase.from('erp_customers').select('id, name, name_ar').eq('is_active', true).order('name').limit(200),
  ]);

  return (
    <div>
      <PageHeader title={t('pharmReturns.title')} description={t('pharmReturns.description')} />
      <ReturnsManager
        branches={(branches as Pick<Branch, 'id' | 'name' | 'name_ar'>[]) ?? []}
        customers={(customers as Pick<ErpCustomer, 'id' | 'name' | 'name_ar'>[]) ?? []}
        batchTracking={flags['pharmacy.batch_tracking'] === true}
        intlLocale={INTL_LOCALE[locale]}
      />
    </div>
  );
}
