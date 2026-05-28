import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { INVOICE_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import type { Invoice, InvoiceLine } from '@/lib/erp/types';

interface LineRow extends InvoiceLine {
  product: { code: string; name: string; name_ar: string | null } | null;
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from('erp_invoices')
    .select('*, customer:erp_customers(*), branch:erp_branches(*, company:erp_companies(*))')
    .eq('id', id)
    .maybeSingle();
  if (!invoice) notFound();

  const inv = invoice as unknown as Invoice & {
    customer: { name: string; name_ar: string | null; phone: string | null; address: string | null; tax_number: string | null } | null;
    branch: {
      name: string; name_ar: string | null; address: string | null; phone: string | null;
      company: { name: string; name_ar: string | null; tax_number: string | null; address: string | null; phone: string | null; currency: string } | null;
    } | null;
  };

  const { data: lines } = await supabase
    .from('erp_invoice_lines')
    .select('*, product:erp_products_catalog(code, name, name_ar)')
    .eq('invoice_id', id);
  const lineRows = (lines as unknown as LineRow[]) ?? [];

  const company = inv.branch?.company;
  const remaining = Number(inv.net_amount) - Number(inv.paid_amount);

  return (
    <div className="space-y-6 text-sm">
      <div className="mb-4 flex justify-end">
        <PrintButton label="طباعة الفاتورة" />
      </div>

      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold">{company?.name_ar || company?.name || 'الشركة'}</h1>
          {company?.address && <p className="text-xs text-gray-600">{company.address}</p>}
          {company?.phone && <p className="text-xs text-gray-600" dir="ltr">{company.phone}</p>}
          {company?.tax_number && <p className="text-xs text-gray-600">رقم ضريبي: {company.tax_number}</p>}
        </div>
        <div className="text-left">
          <h2 className="text-lg font-bold">فاتورة مبيعات</h2>
          <p className="font-mono text-sm" dir="ltr">{inv.invoice_number}</p>
          <p className="text-xs text-gray-600">{formatDate(inv.created_at)}</p>
          <p className="mt-1 text-xs">الحالة: {INVOICE_STATUS_LABELS[inv.status].ar}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="mb-1 font-semibold">العميل</h3>
          <p>{inv.customer?.name_ar || inv.customer?.name || '—'}</p>
          {inv.customer?.phone && <p className="text-xs text-gray-600" dir="ltr">{inv.customer.phone}</p>}
          {inv.customer?.address && <p className="text-xs text-gray-600">{inv.customer.address}</p>}
          {inv.customer?.tax_number && <p className="text-xs text-gray-600">رقم ضريبي: {inv.customer.tax_number}</p>}
        </div>
        <div className="text-left">
          <h3 className="mb-1 font-semibold">الفرع</h3>
          <p>{inv.branch?.name_ar || inv.branch?.name || '—'}</p>
          {inv.due_date && <p className="text-xs text-gray-600">تاريخ الاستحقاق: {formatDate(inv.due_date)}</p>}
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-right">#</th>
            <th className="p-2 text-right">الصنف</th>
            <th className="p-2 text-center">الكمية</th>
            <th className="p-2 text-left">سعر الوحدة</th>
            <th className="p-2 text-center">خصم %</th>
            <th className="p-2 text-left">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {lineRows.map((l, i) => (
            <tr key={l.id} className="border-b">
              <td className="p-2">{i + 1}</td>
              <td className="p-2">
                <span className="me-1 font-mono text-xs text-gray-500" dir="ltr">{l.product?.code}</span>
                {l.product?.name_ar || l.product?.name || '—'}
              </td>
              <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(l.quantity)}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(l.unit_price)}</td>
              <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(l.discount_pct)}</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <table className="w-64 text-sm">
          <tbody>
            <Row label="الإجمالي" value={formatCurrency(inv.total_amount)} />
            <Row label="الخصم" value={formatCurrency(inv.discount_amount)} />
            <Row label="الضريبة" value={formatCurrency(inv.tax_amount)} />
            <tr className="border-t font-bold">
              <td className="p-2">الصافي</td>
              <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(inv.net_amount)}</td>
            </tr>
            <Row label="المدفوع" value={formatCurrency(inv.paid_amount)} />
            <Row label="المتبقي" value={formatCurrency(remaining)} />
          </tbody>
        </table>
      </div>

      {inv.notes && <p className="border-t pt-2 text-xs text-gray-600">ملاحظات: {inv.notes}</p>}

      <div className="border-t pt-6 text-center text-xs text-gray-500">
        شكراً لتعاملكم معنا
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="p-2 text-gray-600">{label}</td>
      <td className="p-2 text-left tabular-nums" dir="ltr">{value}</td>
    </tr>
  );
}
