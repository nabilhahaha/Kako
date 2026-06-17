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

  // Payments for this invoice come from TWO sources: legacy desktop payments
  // (erp_payments) AND the collections engine used by FMCG / van-sales and the
  // Collect screen (erp_collections + erp_collection_allocations). The receipt
  // must reflect both, and the COLLECTED total must equal the invoice's
  // authoritative paid_amount — not just one table (the in-sell / collection
  // payments live in erp_collections, so reading erp_payments alone showed 0).
  const [{ data: payments }, { data: allocs }] = await Promise.all([
    supabase.from('erp_payments').select('*').eq('invoice_id', id).order('payment_date'),
    supabase
      .from('erp_collection_allocations')
      .select('applied_amount, collection:erp_collections(collection_date, method, reference_number)')
      .eq('invoice_id', id),
  ]);

  type Line = { id: string; date: string; method: string; amount: number };
  const fromPayments: Line[] = ((payments as Payment[]) ?? []).map((p) => ({
    id: p.id, date: p.payment_date, method: p.payment_method, amount: Number(p.amount),
  }));
  const fromCollections: Line[] = ((allocs ?? []) as {
    applied_amount: number; collection: { collection_date: string; method: string; reference_number: string | null } | { collection_date: string; method: string; reference_number: string | null }[] | null;
  }[]).map((a, i) => {
    const c = Array.isArray(a.collection) ? a.collection[0] : a.collection;
    return { id: `col-${i}`, date: c?.collection_date ?? inv.created_at, method: c?.method ?? 'cash', amount: Number(a.applied_amount) };
  });
  const payList = [...fromPayments, ...fromCollections].sort((a, b) => a.date.localeCompare(b.date));
  // Authoritative collected total = the invoice's paid_amount (set by both the
  // payment and the collection-settle paths), so it always matches the status.
  const totalPaid = Number(inv.paid_amount ?? 0);
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
        <Row label="التاريخ" value={formatDate(payList[0]?.date ?? inv.created_at)} />
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
              <td className="p-2">{formatDate(p.date)}</td>
              <td className="p-2">{PAYMENT_METHOD_LABELS[p.method as PaymentMethod]?.ar ?? p.method}</td>
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
