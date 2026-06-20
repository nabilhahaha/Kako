import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadCompaniesList } from './companies-workbench-server';
import { CompaniesWorkbench } from './companies-workbench';

export const dynamic = 'force-dynamic';

/**
 * Platform Companies on the Admin Workbench. Platform-owner gated
 * (view_companies). UX standardization only — the four tabs reuse the existing
 * company actions; no business-logic / permission / RLS / workflow change.
 */
export default async function PlatformCompaniesPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const pctx = await getPlatformContext();

  if (!hasPlatformPermission(pctx, 'view_companies')) {
    return (
      <div>
        <PageHeader title={t('platform.overview.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('platform.ownerOnly')}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const companies = await loadCompaniesList(supabase);

  return (
    <div>
      <PageHeader title={t('platform.companies.title')} description={t('platform.companies.description')} />
      <CompaniesWorkbench companies={companies} />
    </div>
  );
}
