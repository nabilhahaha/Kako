import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
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
  await requireNonRetailAdmin();
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

  // Current enabled set for this company + the modules its plan unlocks (read-only,
  // for the plan-locked badges). Both fall back to "all on" when unconfigured.
  const supabase = await createClient();
  const planKey = (ctx.company as { plan_key?: string | null } | null)?.plan_key ?? null;
  const businessType = (ctx.company as { business_type?: string | null } | null)?.business_type ?? null;
  const [{ data: cm }, { data: pm }] = await Promise.all([
    supabase.from('erp_company_modules').select('module, enabled').eq('company_id', ctx.companyId),
    planKey
      ? supabase.from('erp_plan_modules').select('module').eq('plan_key', planKey)
      : Promise.resolve({ data: null }),
  ]);

  const enabled = new Set<Module>(
    cm && cm.length > 0
      ? cm.filter((r) => r.enabled).map((r) => r.module as Module)
      : ALL_MODULES,
  );
  // Empty/unconfigured plan map → treat as "all unlocked" (no false locks).
  const planModules = pm && pm.length > 0 ? pm.map((r) => r.module as string) : null;

  return (
    <div>
      <PageHeader title={t('marketplace.title')} description={t('marketplace.description')} />
      <MarketplaceManager
        enabledModules={[...enabled]}
        planModules={planModules}
        businessType={businessType}
      />
    </div>
  );
}
