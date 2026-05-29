import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TiersManager, type Tier } from './tiers-manager';

export default async function WholesaleTiersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="مستويات الأسعار" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">يتم من داخل حساب الشركة.</p></div>);
  }
  const supabase = await createClient();
  const { data } = await supabase.from('erp_wholesale_tiers').select('id, name, sort, is_active').order('sort').order('name');
  return (
    <div>
      <PageHeader title="مستويات أسعار الجملة" description="عرّف مستويات البيع (قطاعي / جملة / جملة الجملة) ثم حدّد أسعار الأصناف وربط العملاء." />
      <TiersManager tiers={(data as Tier[]) ?? []} />
    </div>
  );
}
