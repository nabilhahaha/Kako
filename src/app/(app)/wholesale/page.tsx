import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { GettingStarted } from '@/components/shared/getting-started';
import { TiersManager, type Tier } from './tiers-manager';

export default async function WholesaleTiersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="مستويات الأسعار" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم من داخل حساب الشركة.</p></div>);
  }
  const supabase = await createClient();
  const [{ data }, { count: customersCount }, { count: invoicesCount }] = await Promise.all([
    supabase.from('erp_wholesale_tiers').select('id, name, sort, is_active').order('sort').order('name'),
    supabase.from('erp_customers').select('id', { count: 'exact', head: true }),
    supabase.from('erp_invoices').select('id', { count: 'exact', head: true }),
  ]);
  const tiers = (data as Tier[]) ?? [];
  return (
    <div>
      <PageHeader title="مستويات أسعار الجملة" description="عرّف مستويات البيع (قطاعي / جملة / جملة الجملة) ثم حدّد أسعار الأصناف وربط العملاء." />
      <GettingStarted
        storageKey="kako_gs_wholesale"
        steps={[
          { label: 'عرّف مستويات الأسعار', href: '/wholesale', done: tiers.length > 0 },
          { label: 'أضف عملاء الجملة', href: '/wholesale/customers', done: (customersCount ?? 0) > 0 },
          { label: 'أصدر أول فاتورة جملة', href: '/wholesale/order', done: (invoicesCount ?? 0) > 0 },
        ]}
      />
      <TiersManager tiers={tiers} />
    </div>
  );
}
