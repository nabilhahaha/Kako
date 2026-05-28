import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PaymentMethod, Profile } from '@/lib/erp/types';

const ACTIVE = ['issued', 'paid', 'partially_paid', 'overdue'];

export default async function DaySummaryPrint({
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
  const { data: profile } = await supabase.from('erp_profiles').select('full_name, email').eq('id', repId).maybeSingle();
  const repName = (profile as Pick<Profile, 'full_name' | 'email'> | null)?.full_name || (profile as { email?: string } | null)?.email || '—';

  const { data: invoices } = await supabase
    .from('erp_invoices')
    .select('invoice_number, net_amount, status, created_at, customer:erp_customers(name, name_ar)')
    .eq('created_by', repId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`);
  const invList = ((invoices as unknown as Array<{
    invoice_number: string; net_amount: number; status: string;
    customer: { name: string; name_ar: string | null } | null;
  }>) ?? []).filter((i) => ACTIVE.includes(i.status));

  const { data: payments } = await supabase
    .from('erp_payments')
    .select('amount, payment_method, invoice:erp_invoices(invoice_number)')
    .eq('received_by', repId)
    .eq('payment_date', date);
  const payList = (payments as unknown as Array<{
    amount: number; payment_method: PaymentMethod; invoice: { invoice_number: string } | null;
  }>) ?? [];

  const salesTotal = invList.reduce((s, i) => s + Number(i.net_amount), 0);
  const cashTotal = payList.filter((p) => p.payment_method === 'cash').reduce((s, p) => s + Number(p.amount), 0);
  const otherTotal = payList.filter((p) => p.payment_method !== 'cash').reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة ملخص اليوم" />
      </div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">ملخص مبيعات اليوم</h1>
        <p className="text-sm">المندوب: <b>{repName}</b> — التاريخ: <b>{formatDate(date)}</b></p>
      </div>

      <div>
        <h3 className="mb-1 font-semibold">الفواتير ({invList.length})</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y bg-gray-100">
              <th className="p-2 text-right">الفاتورة</th>
              <th className="p-2 text-right">العميل</th>
              <th className="p-2 text-left">القيمة</th>
            </tr>
          </thead>
          <tbody>
            {invList.map((i, idx) => (
              <tr key={idx} className="border-b">
                <td className="p-2 font-mono text-xs" dir="ltr">{i.invoice_number}</td>
                <td className="p-2">{i.customer?.name_ar || i.customer?.name || '—'}</td>
                <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(i.net_amount)}</td>
              </tr>
            ))}
            {invList.length === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">لا فواتير</td></tr>}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr><td className="p-2" colSpan={2}>إجمالي المبيعات</td><td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(salesTotal)}</td></tr>
          </tfoot>
        </table>
      </div>

      <div>
        <h3 className="mb-1 font-semibold">التحصيلات ({payList.length})</h3>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y bg-gray-100">
              <th className="p-2 text-right">عن الفاتورة</th>
              <th className="p-2 text-right">الطريقة</th>
              <th className="p-2 text-left">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {payList.map((p, idx) => (
              <tr key={idx} className="border-b">
                <td className="p-2 font-mono text-xs" dir="ltr">{p.invoice?.invoice_number ?? '—'}</td>
                <td className="p-2">{PAYMENT_METHOD_LABELS[p.payment_method]?.ar ?? p.payment_method}</td>
                <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(p.amount)}</td>
              </tr>
            ))}
            {payList.length === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">لا تحصيلات</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-72 space-y-1">
          <SumRow label="تحصيل نقدي" value={formatCurrency(cashTotal)} />
          <SumRow label="تحصيل آخر (بنك/شيك)" value={formatCurrency(otherTotal)} />
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>النقدية المُسلَّمة للكاشير</span>
            <span dir="ltr" className="tabular-nums">{formatCurrency(cashTotal)}</span>
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-between text-xs text-gray-600">
        <span>توقيع المندوب: ____________</span>
        <span>توقيع الكاشير: ____________</span>
      </div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-gray-700">
      <span>{label}</span>
      <span dir="ltr" className="tabular-nums">{value}</span>
    </div>
  );
}
