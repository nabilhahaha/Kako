import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ENTITLEMENTS_ENABLED } from '@/lib/entitlements';
import { loadCompanyFeatureSettings } from '@/lib/entitlements/matrix-server';
import { FeatureSettings } from './feature-settings';

export const dynamic = 'force-dynamic';

// Company Admin — Feature Settings: configure features within entitled modules.
export default async function FeatureSettingsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ENTITLEMENTS_ENABLED()) notFound();
  if (!hasPermission(ctx, 'settings.branches') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();
  const rows = ctx.companyId ? await loadCompanyFeatureSettings(supabase, ctx.companyId) : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('entitlements.featuresTitle')} description={t('entitlements.featuresSubtitle')} />
      {rows.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('entitlements.noFeatures')}</CardContent></Card>
      ) : (
        <FeatureSettings rows={rows} />
      )}
    </div>
  );
}
