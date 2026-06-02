import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requirePermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ServiceCatalogManager, type CatalogService } from '@/components/shared/service-catalog-manager';
import { upsertService } from '../actions';
import { getT } from '@/lib/i18n/server';

export default async function ServicesPage() {
  await requirePermission('clinic.manage');
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('clinic.services.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('clinic.services.noCompany')}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: services } = await supabase
    .from('erp_clinic_services')
    .select('id, name, price, is_active')
    .order('name');

  return (
    <div>
      <PageHeader title={t('clinic.services.title')} description={t('clinic.services.description')} />
      <ServiceCatalogManager services={(services as CatalogService[]) ?? []} upsert={upsertService} entityLabel={t('clinic.services.entityLabel')} namePlaceholder={t('clinic.services.namePlaceholder')} />
    </div>
  );
}
