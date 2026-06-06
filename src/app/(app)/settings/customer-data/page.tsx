import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import type { CustomerLookup } from '@/lib/erp/types';
import { CustomerDataManager } from './customer-data-manager';

/** Settings → Customer Data (FMCG hierarchy S3). Company-managed master data for
 *  customer Segment / Classification / Channel. Gated on settings.custom_fields. */
export default async function CustomerDataPage() {
  await requireNonRetailAdmin();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'settings.custom_fields')) {
    return (
      <div>
        <PageHeader title={t('customerData.pageTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('customerData.superAdminOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: lookups } = await supabase
    .from('erp_customer_lookups')
    .select('*')
    .order('kind')
    .order('sort')
    .order('name');

  return (
    <div>
      <PageHeader title={t('customerData.pageTitle')} description={t('customerData.pageDescription')} />
      <CustomerDataManager lookups={(lookups as CustomerLookup[]) ?? []} />
    </div>
  );
}
