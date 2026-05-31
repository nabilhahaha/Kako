import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

interface DoctorOption { id: string; full_name: string | null; email: string | null }

interface VisitRow {
  fee: number; paid_amount: number; status: string; doctor_id: string | null; service_id: string | null;
}

export default async function ClinicDayClosingPrint({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const sp = await searchParams;
  const date = sp.date || new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const [{ data: visitsData }, { data: doctorsData }, { data: servicesData }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('fee, paid_amount, status, doctor_id, service_id')
      .eq('visit_date', date),
    supabase.rpc('erp_clinic_doctors'),
    supabase.from('erp_clinic_services').select('id, name'),
  ]);

  const visits = ((visitsData as VisitRow[]) ?? []).filter((v) => v.status !== 'cancelled');
  const doctors = (doctorsData as DoctorOption[]) ?? [];
  const docName = (id: string) => {
    const d = doctors.find((x) => x.id === id);
    return d?.full_name || d?.email || 'طبيب';
  };
  const serviceName = new Map(((servicesData as { id: string; name: string }[]) ?? []).map((s) => [s.id, s.name]));

  const count = visits.length;
  const totalFees = visits.reduce((s, v) => s + Number(v.fee || 0), 0);
  const collected = visits.reduce((s, v) => s + Number(v.paid_amount || 0), 0);
  const outstanding = Math.max(0, totalFees - collected);

  const byDoctor = new Map<string, { count: number; collected: number }>();
  for (const v of visits) {
    const k = v.doctor_id || '—';
    const cur = byDoctor.get(k) ?? { count: 0, collected: 0 };
    cur.count += 1; cur.collected += Number(v.paid_amount || 0);
    byDoctor.set(k, cur);
  }
  const byService = new Map<string, { count: number; fees: number }>();
  for (const v of visits) {
    const k = v.service_id ? (serviceName.get(v.service_id) ?? 'خدمة') : 'غير محدد';
    const cur = byService.get(k) ?? { count: 0, fees: 0 };
    cur.count += 1; cur.fees += Number(v.fee || 0);
    byService.set(k, cur);
  }

  const clinicName = ctx.company?.name_ar || ctx.company?.name || 'العيادة';

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة تقفيل اليوم" />
      </div>

      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{clinicName} — تقفيل اليوم</h1>
        <p className="text-sm">التاريخ: <b dir="ltr">{formatDate(date)}</b></p>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Box label="عدد الكشوفات" value={String(count)} />
        <Box label="إجمالي الرسوم" value={formatCurrency(totalFees)} />
        <Box label="المحصّل" value={formatCurrency(collected)} />
        <Box label="المتبقي" value={formatCurrency(outstanding)} />
      </div>

      <div>
        <h3 className="mb-1 font-semibold">حسب الطبيب</h3>
        <table className="w-full border-collapse">
          <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الطبيب</th><th className="p-2 text-center">كشوفات</th><th className="p-2 text-left">المحصّل</th></tr></thead>
          <tbody>
            {[...byDoctor.entries()].map(([id, d]) => (
              <tr key={id} className="border-b">
                <td className="p-2">{id === '—' ? 'غير محدد' : docName(id)}</td>
                <td className="p-2 text-center tabular-nums">{d.count}</td>
                <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(d.collected)}</td>
              </tr>
            ))}
            {byDoctor.size === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">لا كشوفات</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-1 font-semibold">حسب الخدمة</h3>
        <table className="w-full border-collapse">
          <thead><tr className="border-y bg-gray-100"><th className="p-2 text-right">الخدمة</th><th className="p-2 text-center">عدد</th><th className="p-2 text-left">إجمالي الرسوم</th></tr></thead>
          <tbody>
            {[...byService.entries()].map(([name, s]) => (
              <tr key={name} className="border-b">
                <td className="p-2">{name}</td>
                <td className="p-2 text-center tabular-nums">{s.count}</td>
                <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(s.fees)}</td>
              </tr>
            ))}
            {byService.size === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">لا كشوفات</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}
