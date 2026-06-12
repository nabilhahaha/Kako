import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { ValuationView } from './valuation-view';
import { getOfficialMethod, inventoryValuation, type ValuationMethod } from './actions';

export const dynamic = 'force-dynamic';

/** Inventory valuation — the tenant's official costing basis (FIFO / Moving Avg). */
export default async function PharmacyValuationPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('inventory.view') || perms.includes('reports.view') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.inventory_valuation'] !== true) redirect('/pharmacy/dashboard');

  const official: ValuationMethod = await getOfficialMethod();
  const rows = await inventoryValuation('official');
  const canManage = perms.includes('settings.users') || ctx.isSuperAdmin;

  return (
    <div>
      <PageHeader title={t('pharmValuation.title')} description={t('pharmValuation.description')} />
      <ValuationView
        initialRows={rows}
        officialMethod={official}
        canManage={canManage}
        intlLocale={INTL_LOCALE[locale]}
      />
    </div>
  );
}
