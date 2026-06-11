import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { BrandLogo } from '@/components/print/brand-logo';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Invoice, Payment, PaymentMethod } from '@/lib/erp/types';

export default async function ReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params; // invoice id

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from('erp_invoices')
    .select('*, customer:erp_customers(name, name_ar, phone), branch:erp_branches(name, name_ar, company:erp_companies(name, name_ar, logo_url))')
    .eq('id', id)
    .maybeSingle();
  if (!invoice) notFound();
  const inv = invoice as unknown as Invoice & {
    customer: { name: string; name_ar: string | null; phone: string | null } | null;
    branch: { name: string; name_ar: string | null; company: { name: string; name_ar: string | null; logo_url: string | null } | null } | null;
  };

  const { data: payments } = await supabase
    .from('erp_payments')
    .select('*')
    .eq('invoice_id', id)
    .order('payment_date');
  const payList = (payments as Payment[]) ?? [];
  const totalPaid = payList.reduce((s, p) => s + Number(p.amount), 0);
  const company = inv.branch?.company;

  return (
    <div className="space-y-6 text-sm">
      <div className="mb-4 flex justify-end">
        <PrintButton label="طباعة السند" />
      </div>

      <div className="border-b pb-4 text-center">
        <BrandLogo url={company?.logo_url} className="mx-auto mb-2 h-12 w-auto max-w-[160px] object-contain" />
        <h1 className="text-lg font-bold">{company?.name_ar || company?.name || 'الشركة'}</h1>
        <h2 className="mt-2 text-base font-bold">سند تحصيل / قبض</h2>
      </div>

      <div className="space-y-2">
        <Row label="العميل" value={inv.customer?.name_ar || inv.customer?.name || '—'} />
        <Row label="عن الفاتورة" value={inv.invoice_number} ltr />
        <Row label="التاريخ" value={formatDate(payList[0]?.payment_date ?? inv.created_at)} />
        <Row label="إجمالي الفاتورة" value={formatCurrency(inv.net_amount)} ltr />
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-right">التاريخ</th>
            <th className="p-2 text-right">طريقة الدفع</th>
            <th className="p-2 text-left">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {payList.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="p-2">{formatDate(p.payment_date)}</td>
              <td className="p-2">{PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]?.ar ?? p.payment_method}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(p.amount)}</td>
            </tr>
          ))}
          {payList.length === 0 && (
            <tr><td colSpan={3} className="p-3 text-center text-gray-500">لا توجد مدفوعات بعد لهذه الفاتورة.</td></tr>
          )}
        </tbody>
      </table>

      <div className="flex justify-end">
        <div className="w-64">
          <Row label="إجمالي المُحصّل" value={formatCurrency(totalPaid)} ltr />
          <Row label="المتبقي" value={formatCurrency(Number(inv.net_amount) - totalPaid)} ltr />
        </div>
      </div>

      <div className="mt-10 flex justify-between text-xs text-gray-600">
        <span>توقيع المستلم: ____________</span>
        <span>توقيع المحصّل: ____________</span>
      </div>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between border-b py-1">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium tabular-nums" dir={ltr ? 'ltr' : undefined}>{value}</span>
    </div>
  );
}
