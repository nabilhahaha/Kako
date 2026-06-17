import { redirect } from 'next/navigation';
import { Smartphone } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { EmptyState } from '@/components/shared/empty-state';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { OfflineClient } from './offline-client';

export const dynamic = 'force-dynamic';

export default async function FieldOfflinePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field.sales')) redirect('/dashboard');

  const { t } = await getT();

  return (
    <div className="space-y-6">
      <BackLink href="/today" label={t('common.back')} />
      <PageHeader title={t('distribution.oflTitle')} description={t('distribution.oflDescription')} />
      {MOBILE_ENABLED()
        ? <OfflineClient />
        : <EmptyState icon={<Smartphone className="h-7 w-7" />} title={t('distribution.oflDisabled')} />}
    </div>
  );
}
