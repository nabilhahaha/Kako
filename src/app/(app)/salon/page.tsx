import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard as Stat } from '@/components/shared/stat-card';
import { GettingStarted } from '@/components/shared/getting-started';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { Scissors, CalendarClock, Wallet, Receipt, Printer, UserRound } from 'lucide-react';

interface StylistOption { id: string; full_name: string | null; email: string | null }

export default async function SalonDashboard() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('salon.dashboard.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('salon.dashboard.noCompany')}</p></div>);
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: closed }, { data: openTickets }, { data: appts }, { data: staffData },
    { count: servicesCount }, { count: ticketsTotal },
  ] = await Promise.all([
    supabase.from('erp_salon_tickets').select('total, stylist_id').eq('status', 'closed').gte('closed_at', `${today}T00:00:00`),
    supabase.from('erp_salon_tickets').select('id').eq('status', 'open'),
    supabase.from('erp_salon_appointments').select('id').gte('scheduled_at', `${today}T00:00:00`).lte('scheduled_at', `${today}T23:59:59`).in('status', ['scheduled', 'confirmed']),
    supabase.rpc('erp_salon_staff'),
    supabase.from('erp_salon_services').select('id', { count: 'exact', head: true }),
    supabase.from('erp_salon_tickets').select('id', { count: 'exact', head: true }),
  ]);

  const tickets = (closed as { total: number; stylist_id: string | null }[]) ?? [];
  const sales = tickets.reduce((s, t) => s + Number(t.total || 0), 0);
  const staff = (staffData as StylistOption[]) ?? [];
  const byStylist = staff.map((st) => ({
    name: st.full_name || st.email || t('salon.dashboard.defaultStylist'),
    count: tickets.filter((tk) => tk.stylist_id === st.id).length,
    revenue: tickets.filter((tk) => tk.stylist_id === st.id).reduce((s, tk) => s + Number(tk.total || 0), 0),
  })).filter((s) => s.count > 0).sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      <PageHeader title={t('salon.dashboard.title')} description={t('salon.dashboard.description')} action={
        <div className="flex gap-2">
          <Link href="/salon/tickets" className={buttonVariants({ size: 'sm' })}><Scissors className="h-4 w-4" /> {t('salon.dashboard.ticketsLink')}</Link>
          <Link href="/print/salon/day-closing" target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}><Printer className="h-4 w-4" /> {t('salon.dashboard.dayClosingLink')}</Link>
        </div>
      } />
      <GettingStarted
        storageKey="kako_gs_salon"
        steps={[
          { label: t('salon.dashboard.gsServices'), href: '/salon/services', done: (servicesCount ?? 0) > 0 },
          { label: t('salon.dashboard.gsFirstTicket'), href: '/salon/tickets', done: (ticketsTotal ?? 0) > 0 },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('salon.dashboard.statSales')} value={formatCurrency(sales, 'EGP', INTL_LOCALE[locale])} icon={Wallet} tone="success" />
        <Stat label={t('salon.dashboard.statOpenTickets')} value={String(((openTickets as unknown[]) ?? []).length)} icon={Receipt} tone="info" href="/salon/tickets" />
        <Stat label={t('salon.dashboard.statTodayAppts')} value={String(((appts as unknown[]) ?? []).length)} icon={CalendarClock} tone="warning" href="/salon/appointments" />
        <Stat label={t('salon.dashboard.statClosedTickets')} value={String(tickets.length)} icon={Scissors} tone="primary" />
      </div>

      {byStylist.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" /> {t('salon.dashboard.byStylistTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byStylist.map((s) => (
              <Card key={s.name}><CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0"><p className="truncate font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{t('salon.dashboard.ticketCount', { count: s.count })}</p></div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-success" dir="ltr">{formatCurrency(s.revenue, 'EGP', INTL_LOCALE[locale])}</span>
              </CardContent></Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
