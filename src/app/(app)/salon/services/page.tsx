import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ServiceCatalogManager, type CatalogService } from '@/components/shared/service-catalog-manager';
import { getT } from '@/lib/i18n/server';
import { upsertService } from '../actions';

export default async function SalonServicesPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('salon.services.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('salon.services.noCompany')}</p></div>);
  }
  const supabase = await createClient();
  const { data: services } = await supabase.from('erp_salon_services').select('id, name, price, duration_min, is_active').order('name');
  return (
    <div>
      <PageHeader title={t('salon.services.title')} description={t('salon.services.description')} />
      <ServiceCatalogManager services={(services as CatalogService[]) ?? []} upsert={upsertService} showDuration entityLabel={t('salon.services.entityLabel')} namePlaceholder={t('salon.services.namePlaceholder')} />
    </div>
  );
}
