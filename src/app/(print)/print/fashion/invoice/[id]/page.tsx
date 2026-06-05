import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { InvoicePrintActions } from '@/components/fashion/invoice-print-actions';
import { Barcode39 } from '@/components/fashion/barcode';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Invoice, InvoiceLine, InvoiceStatus, PaymentMethod } from '@/lib/erp/types';

interface LineRow extends InvoiceLine {
  product: { code: string; name: string; name_ar: string | null; barcode: string | null; image_url: string | null } | null;
}
interface ScheduleRow {
  seq_no: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
}

/** Bilingual, branded fashion invoice — designed for A4 print and browser
 *  Save-as-PDF. Shows the company logo, a QR placeholder (ready to swap for a
 *  real QR), line items, totals, and the installment schedule when applicable.
 *  Reads standard erp_invoices (created by erp_fashion_checkout), RLS-scoped. */
export default async function FashionInvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const { id } = await params;
  const autoPrint = (await searchParams).print === '1';
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
      company: { name: string; name_ar: string | null; logo_url: string | null; tax_number: string | null; address: string | null; phone: string | null; currency: string } | null;
    } | null;
  };

  const [{ data: lines }, { data: plan }, { data: cashier }, { data: payments }] = await Promise.all([
    supabase.from('erp_invoice_lines').select('*, product:erp_products_catalog(code, name, name_ar, barcode, image_url)').eq('invoice_id', id),
    supabase.from('erp_installment_plans')
      .select('down_payment, financed_amount, installment_count, frequency, schedule:erp_installment_schedule(seq_no, due_date, amount, paid_amount, status)')
      .eq('invoice_id', id).maybeSingle(),
    inv.created_by
      ? supabase.from('erp_profiles').select('full_name').eq('id', inv.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('erp_payments').select('payment_method').eq('invoice_id', id),
  ]);
  const lineRows = (lines as unknown as LineRow[]) ?? [];
  const planRow = plan as unknown as
    | { down_payment: number; financed_amount: number; installment_count: number; frequency: string; schedule: ScheduleRow[] }
    | null;
  const schedule = (planRow?.schedule ?? []).slice().sort((a, b) => a.seq_no - b.seq_no);

  const cashierName = (cashier as { full_name: string | null } | null)?.full_name ?? null;
  const methods = Array.from(new Set(((payments as { payment_method: PaymentMethod }[]) ?? []).map((p) => p.payment_method)));
  const paymentLabel = methods.length
    ? methods.map((m) => PAYMENT_METHOD_LABELS[m]?.[locale] ?? m).join(' · ')
    : planRow
      ? t('fashion.sell.installment')
      : '—';

  const company = inv.branch?.company;
  const currency = company?.currency || 'EGP';
  const money = (n: number | string) => formatCurrency(Number(n) || 0, currency, intl);
  const companyName = (locale === 'ar' ? company?.name_ar || company?.name : company?.name) || t('fashion.invoices.company');
  const customerName = inv.customer ? (locale === 'ar' ? inv.customer.name_ar || inv.customer.name : inv.customer.name) : t('fashion.sell.walkIn');
  const branchName = (locale === 'ar' ? inv.branch?.name_ar || inv.branch?.name : inv.branch?.name) || '—';
  const remaining = Number(inv.net_amount) - Number(inv.paid_amount);
  const statusLabel = INVOICE_STATUS_LABELS[inv.status as InvoiceStatus]?.[locale] ?? inv.status;

  return (
    <div className="space-y-6 text-sm">
      {/* A4 margins; thermal printers use their own paper width. */}
      <style>{`@media print { @page { margin: 8mm; } }`}</style>

      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <InvoicePrintActions autoPrint={autoPrint} />
          {autoPrint && (
            <span className="inline-block rounded border-2 border-gray-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {t('fashion.invoices.reprintBadge')}
            </span>
          )}
        </div>
        <div className="flex items-start gap-3">
          {/* QR placeholder — swap for a real QR later. */}
          <div className="flex flex-col items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded border-2 border-dashed border-gray-400 text-[10px] text-gray-400">
              QR
            </div>
            <span className="mt-0.5 text-[9px] text-gray-400">{t('fashion.invoices.qrPlaceholder')}</span>
          </div>
          {/* Scannable Code 39 barcode of the invoice number. */}
          <Barcode39 value={inv.invoice_number} height={44} />
        </div>
      </div>

      {/* Header: logo + company vs. invoice meta */}
      <div className="flex items-start justify-between border-b pb-4">
        <div className="flex items-start gap-3">
          {company?.logo_url && (
            <Image src={company.logo_url} alt={companyName} width={56} height={56} className="h-14 w-14 rounded object-contain" unoptimized />
          )}
          <div>
            <h1 className="text-xl font-bold">{companyName}</h1>
            {company?.address && <p className="text-xs text-gray-600">{company.address}</p>}
            {company?.phone && <p className="text-xs text-gray-600" dir="ltr">{company.phone}</p>}
            <p className="text-xs text-gray-600">{t('fashion.invoices.vatNumber')}: {company?.tax_number || t('fashion.invoices.vatPlaceholder')}</p>
          </div>
        </div>
        <div className="text-end">
          <h2 className="text-lg font-bold">{t('fashion.invoices.salesInvoice')}</h2>
          <p className="font-mono text-xl font-bold" dir="ltr">{inv.invoice_number}</p>
          <p className="text-xs text-gray-600">{formatDateTime(inv.created_at, intl)}</p>
          <p className="mt-1 text-xs">{t('fashion.invoices.statusLabel')}: {statusLabel}</p>
          {cashierName && <p className="text-xs text-gray-600">{t('fashion.invoices.cashier')}: {cashierName}</p>}
          <p className="text-xs text-gray-600">{t('fashion.invoices.paymentMethod')}: {paymentLabel}</p>
        </div>
      </div>

      {/* Customer + branch */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="mb-1 font-semibold">{t('fashion.invoices.customer')}</h3>
          <p>{customerName}</p>
          {inv.customer?.phone && <p className="text-xs text-gray-600" dir="ltr">{inv.customer.phone}</p>}
          {inv.customer?.address && <p className="text-xs text-gray-600">{inv.customer.address}</p>}
        </div>
        <div className="text-end">
          <h3 className="mb-1 font-semibold">{t('fashion.invoices.branch')}</h3>
          <p>{branchName}</p>
          {inv.due_date && <p className="text-xs text-gray-600">{t('fashion.invoices.dueDate')}: {formatDate(inv.due_date, intl)}</p>}
        </div>
      </div>

      {/* Lines */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-100">
            <th className="p-2 text-start">#</th>
            <th className="p-2 text-start">{t('fashion.invoices.item')}</th>
            <th className="p-2 text-center">{t('fashion.invoices.qty')}</th>
            <th className="p-2 text-end">{t('fashion.invoices.unitPrice')}</th>
            <th className="p-2 text-center">{t('fashion.invoices.discountPct')}</th>
            <th className="p-2 text-end">{t('fashion.invoices.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {lineRows.map((l, i) => (
            <tr key={l.id} className="border-b">
              <td className="p-2">{formatNumber(i + 1, intl)}</td>
              <td className="p-2">
                <div className="flex items-center gap-2">
                  {l.product?.image_url && (
                    <Image src={l.product.image_url} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded object-cover" unoptimized />
                  )}
                  <div className="min-w-0">
                    <p>{(locale === 'ar' ? l.product?.name_ar || l.product?.name : l.product?.name) || '—'}</p>
                    <p className="font-mono text-[11px] text-gray-500" dir="ltr">
                      {l.product?.code}{l.product?.barcode ? ` · ${l.product.barcode}` : ''}
                    </p>
                  </div>
                </div>
              </td>
              <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(l.quantity, intl)}</td>
              <td className="p-2 text-end tabular-nums" dir="ltr">{money(l.unit_price)}</td>
              <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(l.discount_pct, intl)}</td>
              <td className="p-2 text-end tabular-nums" dir="ltr">{money(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <table className="w-64 text-sm">
          <tbody>
            <Row label={t('fashion.invoices.subtotal')} value={money(inv.total_amount)} />
            <Row label={t('fashion.invoices.discount')} value={money(inv.discount_amount)} />
            <Row label={t('fashion.invoices.tax')} value={money(inv.tax_amount)} />
            <tr className="border-t font-bold">
              <td className="p-2">{t('fashion.invoices.net')}</td>
              <td className="p-2 text-end tabular-nums" dir="ltr">{money(inv.net_amount)}</td>
            </tr>
            <Row label={t('fashion.invoices.paid')} value={money(inv.paid_amount)} />
            <Row label={t('fashion.invoices.remaining')} value={money(remaining)} />
          </tbody>
        </table>
      </div>

      {/* Installment schedule (only for installment sales) */}
      {planRow && schedule.length > 0 && (
        <div className="border-t pt-3">
          <h3 className="mb-2 font-semibold">{t('fashion.invoices.installmentPlan')}</h3>
          <p className="mb-2 text-xs text-gray-600">
            {t('fashion.invoices.downPayment')}: {money(planRow.down_payment)} · {t('fashion.invoices.financed')}: {money(planRow.financed_amount)} ·{' '}
            {t('fashion.invoices.installmentCount')}: {formatNumber(planRow.installment_count, intl)}
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y bg-gray-100">
                <th className="p-1.5 text-start">#</th>
                <th className="p-1.5 text-start">{t('fashion.invoices.dueDate')}</th>
                <th className="p-1.5 text-end">{t('fashion.invoices.amount')}</th>
                <th className="p-1.5 text-end">{t('fashion.invoices.paid')}</th>
                <th className="p-1.5 text-center">{t('fashion.invoices.statusLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s) => (
                <tr key={s.seq_no} className="border-b">
                  <td className="p-1.5">{formatNumber(s.seq_no, intl)}</td>
                  <td className="p-1.5">{formatDate(s.due_date, intl)}</td>
                  <td className="p-1.5 text-end tabular-nums" dir="ltr">{money(s.amount)}</td>
                  <td className="p-1.5 text-end tabular-nums" dir="ltr">{money(s.paid_amount)}</td>
                  <td className="p-1.5 text-center">{t(`fashion.invoices.sched_${s.status}` as 'fashion.invoices.sched_due')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inv.notes && <p className="border-t pt-2 text-xs text-gray-600">{t('fashion.invoices.notes')}: {inv.notes}</p>}

      {/* Signature placeholders */}
      <div className="grid grid-cols-2 gap-8 pt-8 text-xs text-gray-600">
        <div className="text-center">
          <div className="mb-1 h-10 border-b border-gray-400"></div>
          {t('fashion.invoices.cashierSignature')}
        </div>
        <div className="text-center">
          <div className="mb-1 h-10 border-b border-gray-400"></div>
          {t('fashion.invoices.customerSignature')}
        </div>
      </div>

      <div className="border-t pt-3 text-center text-[11px] text-gray-500">{t('fashion.invoices.returnPolicy')}</div>
      <div className="pt-2 text-center text-xs text-gray-500">{t('fashion.invoices.thanks')}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="p-2 text-gray-600">{label}</td>
      <td className="p-2 text-end tabular-nums" dir="ltr">{value}</td>
    </tr>
  );
}
