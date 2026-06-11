import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { AutoPrint } from '@/components/print/auto-print';
import { BrandLogo } from '@/components/print/brand-logo';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/erp/constants';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';

/**
 * Pharmacy POS receipt — a clean thermal-style layout for the just-confirmed
 * sale. Opened by the POS "Print receipt now?" prompt; `?autoprint=1` fires the
 * browser print dialog automatically. RLS scopes the invoice to the tenant.
 */
export default async function PharmacyReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { autoprint } = await searchParams;
  const intl = INTL_LOCALE[locale];
  const money = (n: number | null | undefined) => formatCurrency(Number(n ?? 0), 'EGP', intl);

  const supabase = await createClient();
  const { data: invRaw } = await supabase
    .from('erp_invoices')
    .select('*, branch:erp_branches(name, name_ar, phone, company:erp_companies(name, name_ar, logo_url, phone))')
    .eq('id', id)
    .maybeSingle();
  if (!invRaw) notFound();

  const inv = invRaw as unknown as {
    id: string; invoice_number: string; created_at: string; created_by: string | null;
    total_amount: number; discount_amount: number; tax_amount: number; net_amount: number; paid_amount: number;
    branch: {
      name: string; name_ar: string | null; phone: string | null;
      company: { name: string; name_ar: string | null; logo_url: string | null; phone: string | null } | null;
    } | null;
  };

  const [{ data: lineRows }, { data: payRows }] = await Promise.all([
    supabase.from('erp_invoice_lines')
      .select('quantity, unit_price, discount_pct, line_total, product:erp_products_catalog(name, name_ar)')
      .eq('invoice_id', id),
    supabase.from('erp_payments')
      .select('amount, payment_method, payment_date')
      .eq('invoice_id', id).order('payment_date', { ascending: false }).limit(1),
  ]);
  const lines = (lineRows ?? []) as unknown as Array<{
    quantity: number; unit_price: number; discount_pct: number; line_total: number;
    product: { name: string; name_ar: string | null } | null;
  }>;
  const payment = (payRows?.[0] as { amount: number; payment_method: string } | undefined) ?? null;

  let cashier = '—';
  if (inv.created_by) {
    const { data: p } = await supabase.from('erp_profiles').select('full_name, email').eq('id', inv.created_by).maybeSingle();
    const prof = p as { full_name: string | null; email: string | null } | null;
    cashier = prof?.full_name?.trim() || prof?.email || '—';
  }

  const company = inv.branch?.company;
  const pharmacyName = (locale === 'ar' ? company?.name_ar || company?.name : company?.name) || '—';
  const paid = Number(inv.paid_amount || 0);
  const net = Number(inv.net_amount || 0);
  const remaining = Math.max(0, net - paid);
  const change = Math.max(0, paid - net);
  const methodLabel = payment
    ? (PAYMENT_METHOD_OPTIONS.find((m) => m.value === payment.payment_method)?.[locale] ?? payment.payment_method)
    : null;
  const lineName = (l: typeof lines[number]) => (locale === 'ar' ? l.product?.name_ar || l.product?.name : l.product?.name) || '—';

  return (
    <div className="mx-auto max-w-[80mm] space-y-2 p-2 text-[12px] leading-tight text-black">
      {autoprint === '1' && <AutoPrint />}
      <div className="mb-1 flex justify-end print:hidden">
        <PrintButton label={t('pos.receipt.print')} />
      </div>

      {/* Header */}
      <div className="text-center">
        <BrandLogo url={company?.logo_url} className="mx-auto mb-1 h-10 w-auto max-w-[120px] object-contain" />
        <h1 className="text-sm font-bold">{pharmacyName}</h1>
        {inv.branch && <p className="text-[11px]">{locale === 'ar' ? inv.branch.name_ar || inv.branch.name : inv.branch.name}</p>}
        {(inv.branch?.phone || company?.phone) && <p className="text-[11px]" dir="ltr">{inv.branch?.phone || company?.phone}</p>}
      </div>

      <div className="border-y border-dashed py-1 text-[11px]">
        <Row label={t('pos.receipt.invoiceNo')} value={inv.invoice_number} mono />
        <Row label={t('pos.receipt.dateTime')} value={formatDate(inv.created_at, intl)} />
        <Row label={t('pos.receipt.cashier')} value={cashier} />
      </div>

      {/* Items */}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-dashed">
            <th className="py-0.5 text-start font-semibold">{t('pos.receipt.item')}</th>
            <th className="py-0.5 text-center font-semibold">{t('pos.receipt.qty')}</th>
            <th className="py-0.5 text-end font-semibold">{t('pos.receipt.price')}</th>
            <th className="py-0.5 text-end font-semibold">{t('pos.receipt.lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="py-0.5">
                {lineName(l)}
                {Number(l.discount_pct) > 0 && (
                  <span className="block text-[10px] text-gray-600">
                    {t('pos.receipt.discount')}: {formatNumber(l.discount_pct)}%
                  </span>
                )}
              </td>
              <td className="py-0.5 text-center tabular-nums" dir="ltr">{formatNumber(l.quantity)}</td>
              <td className="py-0.5 text-end tabular-nums" dir="ltr">{money(l.unit_price)}</td>
              <td className="py-0.5 text-end tabular-nums" dir="ltr">{money(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="border-t border-dashed pt-1 text-[11px]">
        <Row label={t('pos.receipt.subtotal')} value={money(inv.total_amount)} />
        {Number(inv.discount_amount) > 0 && <Row label={t('pos.receipt.discount')} value={'-' + money(inv.discount_amount)} />}
        {Number(inv.tax_amount) > 0 && <Row label={t('pos.receipt.tax')} value={money(inv.tax_amount)} />}
        <div className="my-1 flex justify-between border-y border-dashed py-1 text-sm font-bold">
          <span>{t('pos.receipt.total')}</span>
          <span dir="ltr" className="tabular-nums">{money(net)}</span>
        </div>
        {methodLabel && <Row label={t('pos.receipt.method')} value={methodLabel} />}
        <Row label={t('pos.receipt.paid')} value={money(paid)} />
        {change > 0 && <Row label={t('pos.receipt.change')} value={money(change)} />}
        {remaining > 0 && <Row label={t('pos.receipt.remaining')} value={money(remaining)} />}
      </div>

      <p className="pt-2 text-center text-[11px] font-medium">{t('pos.receipt.thankYou')}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-600">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} tabular-nums`} dir="ltr">{value}</span>
    </div>
  );
}
