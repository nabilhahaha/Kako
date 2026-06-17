import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-button';
import { BrandLogo } from '@/components/print/brand-logo';

// Credit-note print — erp_credit_notes → return/invoice → customer → company.
// Closes the printing gap (a credit note was created by erp_van_return but had no
// document). Bilingual, print-friendly, branded. Read-only; no schema change.
async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function CreditNotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();
  const supabase = await createClient();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '';

  const cn = await safe(async () => {
    const { data } = await supabase
      .from('erp_credit_notes')
      .select('company_id, return_id, invoice_id, credit_note_number, amount, status, created_at')
      .eq('id', id).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);
  if (!cn) notFound();

  const company = await safe(async () => {
    const { data } = await supabase.from('erp_companies').select('name, name_ar, phone, tax_number, logo_url').eq('id', cn.company_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const ret = await safe(async () => {
    if (!cn.return_id) return null;
    const { data } = await supabase.from('erp_sales_returns').select('return_number, customer_id').eq('id', cn.return_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const invoice = await safe(async () => {
    if (!cn.invoice_id) return null;
    const { data } = await supabase.from('erp_invoices').select('invoice_number').eq('id', cn.invoice_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const customer = await safe(async () => {
    const cid = ret?.customer_id as string | undefined;
    if (!cid) return null;
    const { data } = await supabase.from('erp_customers').select('name, name_ar, code').eq('id', cid).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const Row = ({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) => (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium" dir={ltr ? 'ltr' : undefined}>{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-md pb-10">
      <PrintBar printLabel={t('vanSales.creditNoteDoc.print')} backHref="/sales/returns" backLabel={t('vanSales.creditNoteDoc.back')} />
      <div className="space-y-4 rounded-lg border bg-white p-6 text-black print:border-0 print:p-0">
        <div className="border-b pb-3 text-center">
          <BrandLogo url={company?.logo_url as string | undefined} className="mx-auto mb-2 h-12 w-auto max-w-[160px] object-contain" />
          <h1 className="text-base font-bold">{pick(company?.name as string, company?.name_ar as string) || '—'}</h1>
          {company?.tax_number ? <p className="text-xs text-gray-600">{String(company.tax_number)}</p> : null}
          <p className="mt-1 text-sm font-semibold">{t('vanSales.creditNoteDoc.title')}</p>
        </div>

        <div className="space-y-2">
          <Row label={t('vanSales.creditNoteDoc.number')} value={String(cn.credit_note_number ?? '—')} ltr />
          <Row label={t('vanSales.creditNoteDoc.date')} value={formatDate(cn.created_at as string)} />
          {customer ? <Row label={t('vanSales.creditNoteDoc.customer')} value={pick(customer.name as string, customer.name_ar as string) || String(customer.code ?? '—')} /> : null}
          {ret ? <Row label={t('vanSales.creditNoteDoc.againstReturn')} value={String(ret.return_number ?? '—')} ltr /> : null}
          {invoice ? <Row label={t('vanSales.creditNoteDoc.againstInvoice')} value={String(invoice.invoice_number ?? '—')} ltr /> : null}
          <Row label={t('vanSales.creditNoteDoc.status')} value={String(cn.status ?? '—')} />
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-base font-bold">
          <span>{t('vanSales.creditNoteDoc.amount')}</span>
          <span className="tabular-nums" dir="ltr">{formatCurrency(Number(cn.amount ?? 0))}</span>
        </div>
      </div>
    </div>
  );
}
