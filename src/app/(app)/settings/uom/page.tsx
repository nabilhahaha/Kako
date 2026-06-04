import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { UomManager } from './uom-manager';

export default async function UomPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!hasPermission(ctx, 'uom.manage')) {
    return (
      <div>
        <PageHeader title={t('fmcgw1.uomTitle')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('fmcgw1.notPermitted')}</CardContent></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('fmcgw1.uomTitle')} description={t('fmcgw1.uomDescription')} />
      <UomManager />
    </div>
  );
}
