import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { loadCustomerStatement } from '@/lib/erp/customer-statement-server';
import { AGING_BUCKETS, type AgingBucket, type LedgerKind } from '@/lib/erp/customer-statement';
import type { PaymentMethod } from '@/lib/erp/types';

// Customer account statement — print / PDF (browser "Save as PDF"). Fed by the
// SAME loadCustomerStatement builder as the on-screen statement, so the printed
// summary, aging and ledger can never diverge from the app.
const BUCKET_AR: Record<AgingBucket, string> = {
  current: 'حالي', d30: '1-30', d60: '31-60', d90: '61-90', d90p: '+90',
};
const KIND_AR: Record<LedgerKind, string> = {
  opening: 'رصيد افتتاحي', invoice: 'فاتورة', collection: 'تحصيل', payment: 'تحصيل', credit_note: 'إشعار دائن',
};

export default async function StatementPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { from, to } = await searchParams;

  const supabase = await createClient();
  const res = await loadCustomerStatement(supabase, id, { from, to });
  if (!res) notFound();
  const { customer: c, statement: s } = res;

  // Company name for the header (statement builder is customer-scoped).
  const { data: companyRow } = await supabase
    .from('erp_customers')
    .select('branch:erp_branches(company:erp_companies(name, name_ar))')
    .eq('id', id)
    .maybeSingle();
  const company = (companyRow as unknown as { branch: { company: { name: string; name_ar: string | null } | null } | null } | null)?.branch?.company;

  let running = 0;
  const rows = s.ledger.map((e) => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });

  return (
    <div className="space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton label="طباعة كشف الحساب" />
      </div>
      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{company?.name_ar || company?.name || 'الشركة'}</h1>
        <h2 className="mt-1 text-base font-bold">كشف حساب عميل</h2>
        {(from || to) && <p className="text-xs text-gray-600" dir="ltr">{from ?? '…'} → {to ?? '…'}</p>}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <span>العميل: <b>{c.name_ar || c.name}</b></span>
        <span>الكود: <b dir="ltr">{c.code}</b></span>
        <span>الرصيد الحالي: <b dir="ltr">{formatCurrency(s.summary.currentBalance)}</b></span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-700">
        <span>حد الائتمان: <b dir="ltr">{formatCurrency(s.summary.creditLimit)}</b></span>
        <span>الائتمان المتاح: <b dir="ltr">{formatCurrency(s.summary.availableCredit)}</b></span>
        <span>المتأخر: <b dir="ltr">{formatCurrency(s.summary.overdueAmount)}</b></span>
        <span>فواتير مفتوحة: <b dir="ltr">{s.summary.openInvoiceCount}</b></span>
      </div>

      {/* Aging */}
      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-1">أعمار الديون</th>
            {AGING_BUCKETS.map((b) => <th key={b} className="p-1">{BUCKET_AR[b]}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="p-1 text-gray-600">المبلغ</td>
            {AGING_BUCKETS.map((b) => <td key={b} className="p-1 tabular-nums" dir="ltr">{formatCurrency(s.aging[b])}</td>)}
          </tr>
        </tbody>
      </table>

      {/* Ledger */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-right">التاريخ</th>
            <th className="p-2 text-right">المرجع</th>
            <th className="p-2 text-right">البيان</th>
            <th className="p-2 text-left">مدين</th>
            <th className="p-2 text-left">دائن</th>
            <th className="p-2 text-left">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b">
              <td className="p-2">{formatDate(r.date)}</td>
              <td className="p-2 font-mono text-xs" dir="ltr">{r.ref}</td>
              <td className="p-2">{KIND_AR[r.kind]}{r.method ? ` (${PAYMENT_METHOD_LABELS[r.method as PaymentMethod]?.ar ?? r.method})` : ''}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{r.debit > 0 ? formatCurrency(r.debit) : '—'}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{r.credit > 0 ? formatCurrency(r.credit) : '—'}</td>
              <td className="p-2 text-left font-medium tabular-nums" dir="ltr">{formatCurrency(r.balance)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-3 text-center text-gray-500">لا توجد حركات.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
