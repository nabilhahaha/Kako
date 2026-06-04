import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { ExportsClient } from './exports-client';

export default async function ExportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  return (
    <div>
      <PageHeader title={t('exports.pageTitle')} description={t('exports.pageDescription')} />
      <ExportsClient />
    </div>
  );
}
