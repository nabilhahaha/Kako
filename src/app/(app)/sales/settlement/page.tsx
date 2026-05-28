import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PrintButton } from '@/components/print-button';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PaymentMethod, Profile } from '@/lib/erp/types';

const ACTIVE = ['issued', 'paid', 'partially_paid', 'overdue'];

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string; date?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const sp = await searchParams;

  const date = sp.date || new Date().toISOString().slice(0, 10);
  const repId = sp.rep || ctx.userId;

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from('erp_profiles')
    .select('id, full_name, email')
    .eq('is_active', true);
  const reps = (profiles as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? [];
  const repName = reps.find((r) => r.id === repId)?.full_name || reps.find((r) => r.id === repId)?.email || '—';

  // Collections received by this rep on the date.
  const { data: payments } = await supabase
    .from('erp_payments')
    .select('amount, payment_method, payment_date, invoice:erp_invoices(invoice_number, customer:erp_customers(name, name_ar))')
    .eq('received_by', repId)
    .eq('payment_date', date);
  const payList = (payments as unknown as Array<{
    amount: number;
    payment_method: PaymentMethod;
    invoice: { invoice_number: string; customer: { name: string; name_ar: string | null } | null } | null;
  }>) ?? [];

  // Invoices created by this rep on the date.
  const { data: invoices } = await supabase
    .from('erp_invoices')
    .select('net_amount, status, created_at')
    .eq('created_by', repId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`);
  const invList = (invoices ?? []).filter((i) => ACTIVE.includes(i.status));

  // Visits count.
  const { count: visitCount } = await supabase
    .from('erp_visits')
    .select('id', { count: 'exact', head: true })
    .eq('salesman_id', repId)
    .eq('visit_date', date);

  const cashTotal = payList.filter((p) => p.payment_method === 'cash').reduce((s, p) => s + Number(p.amount), 0);
  const otherTotal = payList.filter((p) => p.payment_method !== 'cash').reduce((s, p) => s + Number(p.amount), 0);
  const collectedTotal = cashTotal + otherTotal;
  const salesTotal = invList.reduce((s, i) => s + Number(i.net_amount), 0);

  return (
    <div>
      <PageHeader title="محاسبة المندوب اليومية" description="تحصيلات ومبيعات المندوب لليوم لتسليمها للكاشير" />

      <Card className="mb-4 print:hidden">
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">المندوب</label>
              <select name="rep" defaultValue={repId} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">التاريخ</label>
              <input type="date" name="date" defaultValue={date} dir="ltr" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <Button type="submit">عرض</Button>
            <PrintButton label="طباعة الكشف" />
          </form>
        </CardContent>
      </Card>

      <div className="mb-4 rounded-md border p-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <span>المندوب: <b>{repName}</b></span>
          <span>التاريخ: <b>{formatDate(date)}</b></span>
          <span>عدد الزيارات: <b>{visitCount ?? 0}</b></span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي المبيعات" value={formatCurrency(salesTotal)} />
        <Stat label="تحصيل نقدي" value={formatCurrency(cashTotal)} tone="ok" />
        <Stat label="تحصيل آخر (بنك/شيك)" value={formatCurrency(otherTotal)} />
        <Stat label="النقدية للكاشير" value={formatCurrency(cashTotal)} tone="warn" big />
      </div>

      <Card>
        <CardContent className="p-0">
          <h3 className="border-b p-3 font-semibold">تفاصيل التحصيل</h3>
          {payList.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">لا توجد تحصيلات في هذا اليوم.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-muted-foreground">
                <tr>
                  <th className="p-2 ps-3 text-right font-medium">الفاتورة</th>
                  <th className="p-2 text-right font-medium">العميل</th>
                  <th className="p-2 text-right font-medium">الطريقة</th>
                  <th className="p-2 pe-3 text-left font-medium">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {payList.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 ps-3 font-mono text-xs" dir="ltr">{p.invoice?.invoice_number ?? '—'}</td>
                    <td className="p-2">{p.invoice?.customer?.name_ar || p.invoice?.customer?.name || '—'}</td>
                    <td className="p-2 text-muted-foreground">{PAYMENT_METHOD_LABELS[p.payment_method]?.ar ?? p.payment_method}</td>
                    <td className="p-2 pe-3 text-left tabular-nums" dir="ltr">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 font-bold">
                <tr>
                  <td className="p-3" colSpan={3}>الإجمالي المُحصّل</td>
                  <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(collectedTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="mt-10 flex justify-between text-xs text-muted-foreground print:mt-20">
        <span>توقيع المندوب: ____________</span>
        <span>توقيع الكاشير: ____________</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, big }: { label: string; value: string; tone?: 'ok' | 'warn'; big?: boolean }) {
  const cls = tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : '';
  return (
    <Card className={big ? 'border-warning/40' : ''}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-bold tabular-nums ${cls}`} dir="ltr">{value}</p>
      </CardContent>
    </Card>
  );
}
