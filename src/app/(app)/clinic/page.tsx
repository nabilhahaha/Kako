import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  Stethoscope,
  Clock,
  Wallet,
  AlertTriangle,
  CalendarClock,
  UserRound,
} from 'lucide-react';
import { type DoctorOption } from './clinical-ui';

const VISIT_STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'destructive' | 'secondary' }> = {
  waiting: { label: 'في الانتظار', variant: 'info' },
  in_progress: { label: 'جاري الكشف', variant: 'warning' },
  done: { label: 'تم', variant: 'success' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

export default async function ClinicDashboardPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="لوحة العيادة" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة العيادة تتم من داخل حساب العيادة.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = `${today}T00:00:00`;
  const dayEnd = `${today}T23:59:59`;

  const [{ data: todayVisits }, { data: openVisits }, { data: todayAppts }, { data: doctorsData }] = await Promise.all([
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
  ]);

  const visits = (todayVisits as unknown as Array<{
    id: string; visit_type: string; fee: number; paid_amount: number; status: string; doctor_id: string | null;
    patient: { name: string } | null;
  }>) ?? [];
  const doctors = (doctorsData as DoctorOption[]) ?? [];

  // Per-doctor split of today's activity (count of visits + collected fees).
  const byDoctor = doctors
    .map((d) => {
      const own = visits.filter((v) => v.doctor_id === d.id && v.status !== 'cancelled');
      return {
        id: d.id,
        name: d.full_name || d.email || 'طبيب',
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

  const timeFmt = new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <PageHeader
        title="لوحة العيادة"
        description="نظرة سريعة على نشاط العيادة اليوم."
        action={
          <Link href="/print/clinic/day-closing" target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            <Printer className="h-4 w-4" /> تقفيل اليوم
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="كشوفات اليوم" value={String(visitsCount)} icon={Stethoscope} tone="primary" href="/clinic/visits" />
        <StatCard label="في الانتظار" value={String(waiting.length)} icon={Clock} tone="info" href="/clinic/visits" />
        <StatCard label="إيراد اليوم" value={formatCurrency(todayRevenue)} icon={Wallet} tone="success" />
        <StatCard label="مستحقات غير محصّلة" value={formatCurrency(outstanding)} icon={AlertTriangle} tone="warning" href="/clinic/visits" />
      </div>

      {byDoctor.length > 1 && (
        <div className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" /> حسب الطبيب اليوم</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {byDoctor.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">د. {d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.count} كشف اليوم</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-success" dir="ltr">{formatCurrency(d.revenue)}</span>
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
                <Clock className="h-4 w-4" /> قائمة الانتظار
              </h2>
              <Link href="/clinic/visits" className="text-xs text-primary hover:underline">الكشوفات</Link>
            </div>
            {waiting.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد مرضى في الانتظار الآن.</p>
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
                <CalendarClock className="h-4 w-4" /> مواعيد اليوم
              </h2>
              <Link href="/clinic/appointments" className="text-xs text-primary hover:underline">عرض الكل</Link>
            </div>
            {upcomingAppts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا توجد مواعيد قادمة اليوم.</p>
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
