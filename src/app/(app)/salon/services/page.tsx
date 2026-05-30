import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ServiceCatalogManager, type CatalogService } from '@/components/shared/service-catalog-manager';
import { upsertService } from '../actions';

export default async function SalonServicesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="الخدمات والأسعار" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة الصالون تتم من داخل حساب الصالون.</p></div>);
  }
  const supabase = await createClient();
  const { data: services } = await supabase.from('erp_salon_services').select('id, name, price, duration_min, is_active').order('name');
  return (
    <div>
      <PageHeader title="الخدمات والأسعار" description="عرّف خدمات الصالون (قص/صبغة/مكواة…) بأسعارها ومدتها." />
      <ServiceCatalogManager services={(services as CatalogService[]) ?? []} upsert={upsertService} showDuration entityLabel="خدمة" namePlaceholder="قص / صبغة / مكواة" />
    </div>
  );
}
