import { redirect } from 'next/navigation';
import { QrCode } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-button';

// Invoice print — clean, print-friendly (A4 + thermal), bilingual. Reuses the
// existing invoice/lines/customer/company data (RLS-scoped). Additive; no schema.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();
  const supabase = await createClient();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '';

  const inv = await safe(async () => {
    const { data } = await supabase
      .from('erp_invoices')
      .select('id, invoice_number, status, total_amount, discount_amount, tax_amount, net_amount, paid_amount, due_date, notes, created_at, customer_id')
      .eq('id', id).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);
  if (!inv) redirect('/sales/invoices');

  const lines = await safe(async () => {
    const { data } = await supabase.from('erp_invoice_lines').select('product_id, quantity, unit_price, discount_pct, line_total').eq('invoice_id', id).order('created_at');
    return (data ?? []) as { product_id: string; quantity: number; unit_price: number; discount_pct: number | null; line_total: number }[];
  }, []);

  const products = await safe(async () => {
    const ids = [...new Set(lines.map((l) => l.product_id))];
    if (!ids.length) return new Map<string, { name: string; name_ar: string | null }>();
    const { data } = await supabase.from('erp_products_catalog').select('id, name, name_ar').in('id', ids);
    return new Map((data ?? []).map((p) => [(p as { id: string }).id, p as { name: string; name_ar: string | null }]));
  }, new Map<string, { name: string; name_ar: string | null }>());

  const customer = await safe(async () => {
    const { data } = await supabase.from('erp_customers').select('name, name_ar, code, tax_number, phone, address, company_id, balance').eq('id', inv.customer_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const company = await safe(async () => {
    if (!customer?.company_id) return null;
    const { data } = await supabase.from('erp_companies').select('name, name_ar, tax_number, cr_number, address, phone, currency').eq('id', customer.company_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const num = (v: unknown) => Number(v ?? 0);
  const net = num(inv.net_amount);
  const paid = num(inv.paid_amount);
  const balance = net - paid;

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <PrintBar printLabel={t('salesman.print')} backHref="/sales/invoices" backLabel={t('salesman.back')} />

      <div className="space-y-5 rounded-lg border bg-white p-6 text-black print:border-0 print:p-0 print:text-black">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-lg font-bold">{pick(company?.name as string, company?.name_ar as string) || '—'}</h1>
            {company?.tax_number ? <p className="text-xs text-gray-600">{t('salesman.taxNo')}: {String(company.tax_number)}</p> : null}
            {company?.cr_number ? <p className="text-xs text-gray-600">{t('salesman.crNo')}: {String(company.cr_number)}</p> : null}
            {company?.phone ? <p className="text-xs text-gray-600" dir="ltr">{String(company.phone)}</p> : null}
          </div>
          <div className="text-end">
            <p className="text-base font-bold">{t('salesman.invoiceTitle')}</p>
            <p className="text-sm font-semibold" dir="ltr">{String(inv.invoice_number ?? '')}</p>
            <p className="text-xs text-gray-600" dir="ltr">{formatDate(inv.created_at as string)}</p>
          </div>
        </div>

        {/* Bill to */}
        <div className="flex flex-wrap justify-between gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">{t('salesman.customer')}</p>
            <p className="font-medium">{pick(customer?.name as string, customer?.name_ar as string) || '—'}</p>
            {customer?.code ? <p className="text-xs text-gray-600" dir="ltr">{String(customer.code)}</p> : null}
            {customer?.tax_number ? <p className="text-xs text-gray-600">{t('salesman.taxNo')}: {String(customer.tax_number)}</p> : null}
          </div>
          {inv.due_date ? (
            <div className="text-end">
              <p className="text-xs font-semibold uppercase text-gray-500">{t('salesman.dueDate')}</p>
              <p dir="ltr">{formatDate(inv.due_date as string)}</p>
            </div>
          ) : null}
        </div>

        {/* Items */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y text-xs uppercase text-gray-500">
              <th className="py-1.5 text-start font-semibold">{t('salesman.item')}</th>
              <th className="py-1.5 text-end font-semibold">{t('salesman.qty')}</th>
              <th className="py-1.5 text-end font-semibold">{t('salesman.price')}</th>
              <th className="py-1.5 text-end font-semibold">{t('salesman.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={4} className="py-3 text-center text-gray-400">—</td></tr>
            ) : lines.map((l, i) => {
              const p = products.get(l.product_id);
              return (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5">{p ? pick(p.name, p.name_ar) : '—'}</td>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{num(l.quantity)}</td>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{formatCurrency(num(l.unit_price))}</td>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{formatCurrency(num(l.line_total))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="ms-auto max-w-xs space-y-1 text-sm">
          <Row label={t('salesman.subtotal')} value={formatCurrency(num(inv.total_amount))} />
          {num(inv.discount_amount) > 0 && <Row label={t('salesman.discount')} value={`- ${formatCurrency(num(inv.discount_amount))}`} />}
          <Row label={t('salesman.vat')} value={formatCurrency(num(inv.tax_amount))} />
          <Row label={t('salesman.total')} value={formatCurrency(net)} bold />
          <Row label={t('salesman.paid')} value={formatCurrency(paid)} />
          <Row label={t('salesman.balance')} value={formatCurrency(balance)} bold />
        </div>

        {/* QR placeholder + notes */}
        <div className="flex items-end justify-between gap-4 border-t pt-4">
          <div className="text-xs text-gray-600">
            {inv.notes ? <p>{String(inv.notes)}</p> : null}
          </div>
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed">
              <QrCode className="h-8 w-8" />
            </div>
            <span className="text-[10px]">{t('salesman.qrPlaceholder')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? 'border-t pt-1 font-bold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className="tabular-nums" dir="ltr">{value}</span>
    </div>
  );
}
