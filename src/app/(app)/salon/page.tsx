import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard as Stat } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { Scissors, CalendarClock, Wallet, Receipt, Printer, UserRound } from 'lucide-react';

interface StylistOption { id: string; full_name: string | null; email: string | null }

export default async function SalonDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title="لوحة الصالون" /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة الصالون تتم من داخل حساب الصالون.</p></div>);
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: closed }, { data: openTickets }, { data: appts }, { data: staffData }] = await Promise.all([
    supabase.from('erp_salon_tickets').select('total, stylist_id').eq('status', 'closed').gte('closed_at', `${today}T00:00:00`),
    supabase.from('erp_salon_tickets').select('id').eq('status', 'open'),
    supabase.from('erp_salon_appointments').select('id').gte('scheduled_at', `${today}T00:00:00`).lte('scheduled_at', `${today}T23:59:59`).in('status', ['scheduled', 'confirmed']),
    supabase.rpc('erp_salon_staff'),
  ]);

  const tickets = (closed as { total: number; stylist_id: string | null }[]) ?? [];
  const sales = tickets.reduce((s, t) => s + Number(t.total || 0), 0);
  const staff = (staffData as StylistOption[]) ?? [];
  const byStylist = staff.map((st) => ({
    name: st.full_name || st.email || 'مصفف',
    count: tickets.filter((t) => t.stylist_id === st.id).length,
    revenue: tickets.filter((t) => t.stylist_id === st.id).reduce((s, t) => s + Number(t.total || 0), 0),
  })).filter((s) => s.count > 0).sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      <PageHeader title="لوحة الصالون" description="نظرة سريعة على نشاط اليوم." action={
        <div className="flex gap-2">
          <Link href="/salon/tickets" className={buttonVariants({ size: 'sm' })}><Scissors className="h-4 w-4" /> التذاكر</Link>
          <Link href="/print/salon/day-closing" target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}><Printer className="h-4 w-4" /> تقفيل اليوم</Link>
        </div>
      } />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="مبيعات اليوم" value={formatCurrency(sales)} icon={Wallet} tone="success" />
        <Stat label="تذاكر مفتوحة" value={String(((openTickets as unknown[]) ?? []).length)} icon={Receipt} tone="info" href="/salon/tickets" />
        <Stat label="مواعيد اليوم" value={String(((appts as unknown[]) ?? []).length)} icon={CalendarClock} tone="warning" href="/salon/appointments" />
        <Stat label="عدد التذاكر المغلقة" value={String(tickets.length)} icon={Scissors} tone="primary" />
      </div>

      {byStylist.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" /> حسب المصفف اليوم</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byStylist.map((s) => (
              <Card key={s.name}><CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0"><p className="truncate font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.count} تذكرة</p></div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-success" dir="ltr">{formatCurrency(s.revenue)}</span>
              </CardContent></Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
