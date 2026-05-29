import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ServicesManager, type Service } from './services-manager';

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
      <ServicesManager services={(services as Service[]) ?? []} />
    </div>
  );
}
