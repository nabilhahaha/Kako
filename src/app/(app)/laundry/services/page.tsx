import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ServiceCatalogManager, type CatalogService } from '@/components/shared/service-catalog-manager';
import { upsertService } from '../actions';
import { getT } from '@/lib/i18n/server';

export default async function LaundryServicesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('laundry.services.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('laundry.noCompany')}</p></div>);
  }
  const supabase = await createClient();
  const { data } = await supabase.from('erp_laundry_services').select('id, name, price, is_active').order('name');
  return (
    <div>
      <PageHeader title={t('laundry.services.title')} description={t('laundry.services.description')} />
      <ServiceCatalogManager services={(data as CatalogService[]) ?? []} upsert={upsertService} entityLabel={t('laundry.services.entityLabel')} namePlaceholder={t('laundry.services.namePlaceholder')} />
    </div>
  );
}
