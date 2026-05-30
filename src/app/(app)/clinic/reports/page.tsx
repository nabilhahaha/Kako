import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { DoctorOption } from '../clinical-ui';
import { DateRangeFilter, IncomeChart } from './report-controls';
import { Wallet, CalendarDays, Stethoscope, AlertTriangle, UserRound, Tags, LineChart } from 'lucide-react';

interface VisitRow {
  paid_amount: number;
  fee: number;
  doctor_id: string | null;
  visit_date: string;
  status: string;
  service: { name: string } | null;
}

export default async function ClinicReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAnyPermission(['clinic.manage', 'reports.view']);
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="تقارير العيادة" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">إدارة العيادة تتم من داخل حساب العيادة.</p>
      </div>
    );
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const sp = await searchParams;
  const from = sp.from || monthStart;
  const to = sp.to || today;

  const supabase = await createClient();
  const [{ data: visitsData }, { data: doctorsData }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('paid_amount, fee, doctor_id, visit_date, status, service:erp_clinic_services(name)')
      .gte('visit_date', from)
      .lte('visit_date', to),
    supabase.rpc('erp_clinic_doctors'),
  ]);

  const visits = ((visitsData as unknown as VisitRow[]) ?? []).filter((v) => v.status !== 'cancelled');
  const doctors = (doctorsData as DoctorOption[]) ?? [];
  const doctorName = (id: string | null) => {
    const d = doctors.find((x) => x.id === id);
    return d ? (d.full_name || d.email || 'طبيب') : 'غير محدد';
  };

  const periodRevenue = visits.reduce((s, v) => s + Number(v.paid_amount || 0), 0);
  const todayRevenue = visits.filter((v) => v.visit_date === today).reduce((s, v) => s + Number(v.paid_amount || 0), 0);
  const periodVisits = visits.length;
  const outstanding = visits.reduce((s, v) => s + Math.max(0, Number(v.fee || 0) - Number(v.paid_amount || 0)), 0);

  // Daily income (for the chart).
  const dayMap = new Map<string, number>();
  for (const v of visits) dayMap.set(v.visit_date, (dayMap.get(v.visit_date) ?? 0) + Number(v.paid_amount || 0));
  const byDay = [...dayMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, rev]) => ({ day: d.slice(5), revenue: Math.round(rev) }));

  // By doctor
  const docMap = new Map<string, { name: string; visits: number; revenue: number }>();
  for (const v of visits) {
    const key = v.doctor_id ?? 'none';
    const row = docMap.get(key) ?? { name: doctorName(v.doctor_id), visits: 0, revenue: 0 };
    row.visits += 1;
    row.revenue += Number(v.paid_amount || 0);
    docMap.set(key, row);
  }
  const byDoctor = [...docMap.values()].sort((a, b) => b.revenue - a.revenue);

  // By service
  const svcMap = new Map<string, { name: string; count: number; revenue: number }>();
  for (const v of visits) {
    const name = v.service?.name ?? 'كشف / بدون خدمة';
    const row = svcMap.get(name) ?? { name, count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += Number(v.paid_amount || 0);
    svcMap.set(name, row);
  }
  const byService = [...svcMap.values()].sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      <PageHeader title="تقارير العيادة" description="دخل العيادة خلال الفترة المحددة" />

      <Card className="mb-4">
        <CardContent className="pt-6"><DateRangeFilter from={from} to={to} /></CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="إيراد اليوم" value={formatCurrency(todayRevenue)} icon={Wallet} tone="success" />
        <StatCard label="إيراد الفترة" value={formatCurrency(periodRevenue)} icon={CalendarDays} tone="primary" />
        <StatCard label="كشوفات الفترة" value={String(periodVisits)} icon={Stethoscope} tone="info" />
        <StatCard label="مستحقات غير محصّلة" value={formatCurrency(outstanding)} icon={AlertTriangle} tone="warning" />
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b p-4 font-semibold"><LineChart className="h-4 w-4" /> الدخل اليومي</div>
          <IncomeChart data={byDay} />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ReportTable
          title="الدخل حسب الطبيب"
          icon={<UserRound className="h-4 w-4" />}
          cols={['الطبيب', 'كشوفات', 'الإيراد']}
          rows={byDoctor.map((d) => [d.name, String(d.visits), formatCurrency(d.revenue)])}
        />
        <ReportTable
          title="الدخل حسب الخدمة"
          icon={<Tags className="h-4 w-4" />}
          cols={['الخدمة', 'عدد', 'الإيراد']}
          rows={byService.map((s) => [s.name, String(s.count), formatCurrency(s.revenue)])}
        />
      </div>
    </div>
  );
}

function ReportTable({ title, icon, cols, rows }: { title: string; icon: React.ReactNode; cols: string[]; rows: string[][] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 border-b p-4 font-semibold">{icon} {title}</div>
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">لا توجد بيانات هذا الشهر.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-right font-medium">{cols[0]}</th>
                <th className="p-3 text-center font-medium">{cols[1]}</th>
                <th className="p-3 text-left font-medium">{cols[2]}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-3 font-medium">{r[0]}</td>
                  <td className="p-3 text-center tabular-nums">{r[1]}</td>
                  <td className="p-3 text-left tabular-nums" dir="ltr">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
