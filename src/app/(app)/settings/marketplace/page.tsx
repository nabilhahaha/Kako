import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { ALL_MODULES, type Module } from '@/lib/erp/navigation';
import { MarketplaceManager } from './marketplace-manager';

/** App Marketplace — the company admin enables/disables modules at any time,
 *  without recreating the workspace. Reads the current company_modules state and
 *  presents every coarse module as an installable "app". */
export default async function MarketplacePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!isCompanyAdmin) {
    return (
      <div>
        <PageHeader title={t('marketplace.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  // Current enabled set for this company (falls back to "all on" if unconfigured).
  const supabase = await createClient();
  const { data: cm } = await supabase
    .from('erp_company_modules')
    .select('module, enabled')
    .eq('company_id', ctx.companyId);

  const enabled = new Set<Module>(
    cm && cm.length > 0
      ? cm.filter((r) => r.enabled).map((r) => r.module as Module)
      : ALL_MODULES,
  );

  return (
    <div>
      <PageHeader title={t('marketplace.title')} description={t('marketplace.description')} />
      <MarketplaceManager enabledModules={[...enabled]} />
    </div>
  );
}
