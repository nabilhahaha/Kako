import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TablesFloor, type FloorTable } from './tables-floor';

export default async function TablesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="الطاولات" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة المطعم تتم من داخل حساب المطعم.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: tables }, { data: openOrders }] = await Promise.all([
    supabase.from('erp_restaurant_tables').select('id, name, seats, status, is_active').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_restaurant_orders').select('id, table_id').eq('status', 'open').not('table_id', 'is', null),
  ]);

  const openByTable = new Map<string, string>();
  for (const o of (openOrders as { id: string; table_id: string }[]) ?? []) openByTable.set(o.table_id, o.id);

  const floor: FloorTable[] = ((tables as { id: string; name: string; seats: number; status: string }[]) ?? []).map((t) => ({
    ...t, openOrderId: openByTable.get(t.id) ?? null,
  }));

  return (
    <div>
      <PageHeader title="الطاولات" description="خريطة الصالة — اضغط طاولة لفتح أوردرها." />
      <TablesFloor tables={floor} />
    </div>
  );
}
