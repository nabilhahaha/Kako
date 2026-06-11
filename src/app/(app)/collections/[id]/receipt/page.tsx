import { redirect } from 'next/navigation';
import { Wallet } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-button';
import { BrandLogo } from '@/components/print/brand-logo';

// Collection receipt print — payment → invoice → customer → company (all in
// production). Bilingual, print-friendly. Additive; no schema change.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();
  const supabase = await createClient();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '';

  const pay = await safe(async () => {
    const { data } = await supabase.from('erp_payments').select('id, invoice_id, amount, payment_method, reference_number, payment_date, created_at').eq('id', id).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);
  if (!pay) redirect('/sales/invoices');

  const invoice = await safe(async () => {
    const { data } = await supabase.from('erp_invoices').select('invoice_number, customer_id, net_amount, paid_amount').eq('id', pay.invoice_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const customer = await safe(async () => {
    if (!invoice?.customer_id) return null;
    const { data } = await supabase.from('erp_customers').select('name, name_ar, code, company_id, balance').eq('id', invoice.customer_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const company = await safe(async () => {
    if (!customer?.company_id) return null;
    const { data } = await supabase.from('erp_companies').select('name, name_ar, phone, logo_url').eq('id', customer.company_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const num = (v: unknown) => Number(v ?? 0);

  return (
    <div className="mx-auto max-w-md pb-10">
      <PrintBar printLabel={t('salesman.print')} backHref="/sales/invoices" backLabel={t('salesman.back')} />
      <div className="space-y-4 rounded-lg border bg-white p-6 text-black print:border-0 print:p-0">
        <div className="border-b pb-3 text-center">
          <BrandLogo url={company?.logo_url as string | undefined} className="mx-auto mb-2 h-12 w-auto max-w-[160px] object-contain" />
          <h1 className="text-base font-bold">{pick(company?.name as string, company?.name_ar as string) || '—'}</h1>
          <p className="mt-1 text-sm font-semibold">{t('vanops.receiptTitle')}</p>
          <p className="text-xs text-gray-600" dir="ltr">{String(pay.reference_number ?? pay.id).slice(0, 18)}</p>
        </div>

        <div className="flex items-center justify-center gap-2 py-2 text-center">
          <Wallet className="h-6 w-6 text-gray-500" />
          <span className="text-2xl font-bold tabular-nums" dir="ltr">{formatCurrency(num(pay.amount))}</span>
        </div>

        <dl className="space-y-1.5 text-sm">
          <Row label={t('vanops.receivedFrom')} value={pick(customer?.name as string, customer?.name_ar as string) || '—'} />
          {customer?.code ? <Row label={t('salesman.customer')} value={String(customer.code)} ltr /> : null}
          <Row label={t('vanops.method')} value={String(pay.payment_method ?? '—')} ltr />
          {invoice?.invoice_number ? <Row label={t('vanops.againstInvoice')} value={String(invoice.invoice_number)} ltr /> : null}
          <Row label={t('salesman.date')} value={formatDate((pay.payment_date as string) || (pay.created_at as string))} ltr />
          {customer ? <Row label={t('salesman.balance')} value={formatCurrency(num(customer.balance))} ltr /> : null}
        </dl>

        <p className="border-t pt-3 text-center text-xs text-gray-500">{t('vanops.receiptThanks')}</p>
      </div>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-600">{label}</dt>
      <dd className="font-medium" dir={ltr ? 'ltr' : undefined}>{value}</dd>
    </div>
  );
}
