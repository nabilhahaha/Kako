import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { ServicesManager, type Service } from './services-manager';

export default async function LaundryServicesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="الأصناف والأسعار" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة المغسلة تتم من داخل حساب المغسلة.</p></div>);
  }
  const supabase = await createClient();
  const { data } = await supabase.from('erp_laundry_services').select('id, name, price, is_active').order('name');
  return (
    <div>
      <PageHeader title="الأصناف والأسعار" description="قائمة الأصناف (قميص/بنطلون/بدلة/غسيل عادي…) بأسعارها." />
      <ServicesManager services={(data as Service[]) ?? []} />
    </div>
  );
}
