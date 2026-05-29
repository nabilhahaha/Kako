import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requirePermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ServicesManager, type Service } from './services-manager';

export default async function ServicesPage() {
  await requirePermission('clinic.manage');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="الخدمات والأسعار" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة العيادة تتم من داخل حساب العيادة.
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
      <PageHeader title="الخدمات والأسعار" description="عرّف خدمات العيادة بأسعارها لتُختار سريعاً عند تسجيل الكشف." />
      <ServicesManager services={(services as Service[]) ?? []} />
    </div>
  );
}
