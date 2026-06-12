import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { LoyaltyView } from './loyalty-view';
import { getLoyaltySettings, recentLoyaltyLedger } from './actions';

export const dynamic = 'force-dynamic';

/** Loyalty programme — tenant rates + recent ledger. */
export default async function PharmacyLoyaltyPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('reports.view') || perms.includes('settings.users') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.loyalty'] !== true) redirect('/pharmacy/dashboard');

  const [settings, ledger] = await Promise.all([getLoyaltySettings(), recentLoyaltyLedger()]);
  const canManage = perms.includes('settings.users') || ctx.isSuperAdmin;

  return (
    <div>
      <PageHeader title={t('pharmLoyalty.title')} description={t('pharmLoyalty.description')} />
      <LoyaltyView settings={settings} ledger={ledger} canManage={canManage} intlLocale={INTL_LOCALE[locale]} />
    </div>
  );
}
