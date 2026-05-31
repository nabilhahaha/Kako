import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { GettingStarted } from '@/components/shared/getting-started';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import {
  Stethoscope,
  Clock,
  Wallet,
  AlertTriangle,
  CalendarClock,
  UserRound,
} from 'lucide-react';
import { type DoctorOption } from './clinical-ui';

export default async function ClinicDashboardPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('clinic.dashboard.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('clinic.dashboard.noCompany')}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = `${today}T00:00:00`;
  const dayEnd = `${today}T23:59:59`;

  const [
    { data: todayVisits }, { data: openVisits }, { data: todayAppts }, { data: doctorsData },
    { count: servicesCount }, { count: patientsCount }, { count: visitsTotal },
  ] = await Promise.all([
    // Today's visits (for count + revenue + waiting queue + per-doctor split).
    supabase
      .from('erp_clinic_visits')
      .select('id, visit_type, fee, paid_amount, status, doctor_id, patient:erp_patients(name)')
      .eq('visit_date', today)
      .order('created_at', { ascending: true }),
    // Outstanding fees across all non-cancelled visits.
    supabase
      .from('erp_clinic_visits')
      .select('fee, paid_amount')
      .neq('status', 'cancelled'),
    // Today's appointments.
    supabase
      .from('erp_clinic_appointments')
      .select('id, scheduled_at, reason, status, patient:erp_patients(name, phone)')
      .gte('scheduled_at', dayStart)
      .lte('scheduled_at', dayEnd)
      .order('scheduled_at', { ascending: true }),
    supabase.rpc('erp_clinic_doctors'),
    supabase.from('erp_clinic_services').select('id', { count: 'exact', head: true }),
    supabase.from('erp_patients').select('id', { count: 'exact', head: true }),
    supabase.from('erp_clinic_visits').select('id', { count: 'exact', head: true }),
  ]);

  const visits = (todayVisits as unknown as Array<{
    id: string; visit_type: string; fee: number; paid_amount: number; status: string; doctor_id: string | null;
    patient: { name: string } | null;
  }>) ?? [];
  const doctors = (doctorsData as DoctorOption[]) ?? [];

  type VisitStatusKey = 'waiting' | 'in_progress' | 'done' | 'cancelled';
  const VISIT_STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'destructive' | 'secondary' }> = {
    waiting: { label: t('clinic.visitStatus.waiting'), variant: 'info' },
    in_progress: { label: t('clinic.visitStatus.in_progress'), variant: 'warning' },
    done: { label: t('clinic.visitStatus.done'), variant: 'success' },
    cancelled: { label: t('clinic.visitStatus.cancelled'), variant: 'destructive' },
  };

  // Per-doctor split of today's activity (count of visits + collected fees).
  const byDoctor = doctors
    .map((d) => {
      const own = visits.filter((v) => v.doctor_id === d.id && v.status !== 'cancelled');
      return {
        id: d.id,
        name: d.full_name || d.email || t('clinic.ui.defaultDoctor'),
        count: own.length,
        revenue: own.reduce((s, v) => s + Number(v.paid_amount || 0), 0),
      };
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);

  const visitsCount = visits.filter((v) => v.status !== 'cancelled').length;
  const waiting = visits.filter((v) => v.status === 'waiting' || v.status === 'in_progress');
  const todayRevenue = visits.reduce((s, v) => s + Number(v.paid_amount || 0), 0);

  const outstanding = ((openVisits as Array<{ fee: number; paid_amount: number }>) ?? [])
    .reduce((s, v) => s + Math.max(0, Number(v.fee || 0) - Number(v.paid_amount || 0)), 0);

  const appts = (todayAppts as unknown as Array<{
    id: string; scheduled_at: string; reason: string | null; status: string;
    patient: { name: string; phone: string | null } | null;
  }>) ?? [];
  const upcomingAppts = appts.filter((a) => a.status === 'scheduled' || a.status === 'confirmed');

  const timeFmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <PageHeader
        title={t('clinic.dashboard.title')}
        description={t('clinic.dashboard.description')}
        action={
          <Link href="/print/clinic/day-closing" target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            <Printer className="h-4 w-4" /> {t('clinic.dashboard.dayClosure')}
          </Link>
        }
      />

      <GettingStarted
        storageKey="kako_gs_clinic"
        steps={[
          { label: t('clinic.dashboard.gsByServices'), href: '/clinic/services', done: (servicesCount ?? 0) > 0 },
          { label: t('clinic.dashboard.gsByPatients'), href: '/clinic/patients', done: (patientsCount ?? 0) > 0 },
          { label: t('clinic.dashboard.gsByVisits'), href: '/clinic/reception', done: (visitsTotal ?? 0) > 0 },
        ]}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('clinic.dashboard.statVisits')} value={String(visitsCount)} icon={Stethoscope} tone="primary" href="/clinic/visits" />
        <StatCard label={t('clinic.dashboard.statWaiting')} value={String(waiting.length)} icon={Clock} tone="info" href="/clinic/visits" />
        <StatCard label={t('clinic.dashboard.statRevenue')} value={formatCurrency(todayRevenue, 'EGP', INTL_LOCALE[locale])} icon={Wallet} tone="success" />
        <StatCard label={t('clinic.dashboard.statOutstanding')} value={formatCurrency(outstanding, 'EGP', INTL_LOCALE[locale])} icon={AlertTriangle} tone="warning" href="/clinic/visits" />
      </div>

      {byDoctor.length > 1 && (
        <div className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" /> {t('clinic.dashboard.byDoctorTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byDoctor.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t('clinic.dashboard.doctorPrefix')} {d.name}</p>
                    <p className="text-xs text-muted-foreground">{t('clinic.dashboard.doctorVisits', { count: d.count })}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-success" dir="ltr">{formatCurrency(d.revenue, 'EGP', INTL_LOCALE[locale])}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4" /> {t('clinic.dashboard.waitingQueueTitle')}
              </h2>
              <Link href="/clinic/visits" className="text-xs text-primary hover:underline">{t('clinic.dashboard.waitingQueueLink')}</Link>
            </div>
            {waiting.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('clinic.dashboard.waitingEmpty')}</p>
            ) : (
              <ul className="divide-y">
                {waiting.map((v) => {
                  const st = VISIT_STATUS[v.status] ?? { label: v.status, variant: 'secondary' as const };
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <p className="truncate font-medium">{v.patient?.name ?? '—'}</p>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <CalendarClock className="h-4 w-4" /> {t('clinic.dashboard.appointmentsTitle')}
              </h2>
              <Link href="/clinic/appointments" className="text-xs text-primary hover:underline">{t('clinic.dashboard.appointmentsLink')}</Link>
            </div>
            {upcomingAppts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('clinic.dashboard.appointmentsEmpty')}</p>
            ) : (
              <ul className="divide-y">
                {upcomingAppts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.patient?.name ?? '—'}</p>
                      {a.reason && <p className="truncate text-xs text-muted-foreground">{a.reason}</p>}
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                      {timeFmt.format(new Date(a.scheduled_at))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
