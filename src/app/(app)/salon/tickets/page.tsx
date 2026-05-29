import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { TicketsList, type OpenTicket, type StylistOption } from './tickets-list';

export default async function SalonTicketsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="التذاكر" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة الصالون تتم من داخل حساب الصالون.</p></div>);
  }
  const supabase = await createClient();
  const [{ data: tickets }, { data: staff }] = await Promise.all([
    supabase.from('erp_salon_tickets').select('id, customer_name, stylist_id, discount_value, created_at, items:erp_salon_ticket_items(qty, price)').eq('status', 'open').order('created_at'),
    supabase.rpc('erp_salon_staff'),
  ]);
  const list: OpenTicket[] = ((tickets as unknown as Array<{ id: string; customer_name: string | null; stylist_id: string | null; discount_value: number; items: { qty: number; price: number }[] | null }>) ?? []).map((t) => ({
    id: t.id, customer_name: t.customer_name, stylist_id: t.stylist_id,
    total: Math.max((t.items ?? []).reduce((s, it) => s + Number(it.qty) * Number(it.price), 0) - Number(t.discount_value || 0), 0),
    item_count: (t.items ?? []).length,
  }));
  return (
    <div>
      <PageHeader title="التذاكر المفتوحة" description="افتح تذكرة عميل جديدة أو أكمل تذكرة قائمة." />
      <TicketsList tickets={list} staff={(staff as StylistOption[]) ?? []} />
    </div>
  );
}
