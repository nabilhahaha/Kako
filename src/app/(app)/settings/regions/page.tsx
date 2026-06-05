import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import type { Region, Area } from '@/lib/erp/types';
import { RegionsManager } from './regions-manager';

/** Settings → Regions & Areas (FMCG hierarchy S1). Org-structure management,
 *  gated on settings.branches. Entities + branch links only; scope = S4. */
export default async function RegionsPage() {
  await requireNonRetailAdmin();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'settings.branches')) {
    return (
      <div>
        <PageHeader title={t('regions.pageTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('settings.branches.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: regions }, { data: areas }] = await Promise.all([
    supabase.from('erp_regions').select('*').order('sort').order('name'),
    supabase.from('erp_areas').select('*').order('sort').order('name'),
  ]);

  return (
    <div>
      <PageHeader title={t('regions.pageTitle')} description={t('regions.pageDescription')} />
      <RegionsManager
        regions={(regions as Region[]) ?? []}
        areas={(areas as Area[]) ?? []}
      />
    </div>
  );
}
