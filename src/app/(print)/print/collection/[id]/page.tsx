import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-button';
import { BrandLogo } from '@/components/print/brand-logo';

// Collection receipt for erp_collections (the multi-invoice settlement). Closes
// the audit gap (the legacy /collections/[id]/receipt reads erp_payments). Shows
// the receipt number, method, amount, applied/on-account, and the per-invoice
// allocation. Branded, bilingual, print-friendly. Read-only; additive.
async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function CollectionReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();
  const supabase = await createClient();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '';

  const col = await safe(async () => {
    const { data } = await supabase
      .from('erp_collections')
      .select('branch_id, customer_id, collection_number, collection_date, method, reference_number, amount, applied_amount, unapplied_amount, status')
      .eq('id', id).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);
  if (!col) notFound();

  const company = await safe(async () => {
    const { data: b } = await supabase.from('erp_branches').select('company_id').eq('id', col.branch_id as string).maybeSingle();
    const cid = (b as { company_id?: string } | null)?.company_id;
    if (!cid) return null;
    const { data } = await supabase.from('erp_companies').select('name, name_ar, tax_number, logo_url').eq('id', cid).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const customer = await safe(async () => {
    const { data } = await supabase.from('erp_customers').select('name, name_ar, code').eq('id', col.customer_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const allocations = await safe(async () => {
    const { data } = await supabase.from('erp_collection_allocations').select('invoice_id, applied_amount').eq('collection_id', id);
    const rows = (data ?? []) as { invoice_id: string; applied_amount: number }[];
    if (rows.length === 0) return [] as { number: string; applied: number }[];
    const { data: invs } = await supabase.from('erp_invoices').select('id, invoice_number').in('id', rows.map((r) => r.invoice_id));
    const numById = new Map(((invs ?? []) as { id: string; invoice_number: string }[]).map((i) => [i.id, i.invoice_number]));
    return rows.map((r) => ({ number: numById.get(r.invoice_id) ?? '—', applied: Number(r.applied_amount) }));
  }, [] as { number: string; applied: number }[]);

  const Row = ({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) => (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium" dir={ltr ? 'ltr' : undefined}>{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-md pb-10">
      <PrintBar printLabel={t('vanSales.collectDoc.print')} backHref="/customers" backLabel={t('vanSales.collectDoc.back')} />
      <div className="space-y-4 rounded-lg border bg-white p-6 text-black print:border-0 print:p-0">
        <div className="border-b pb-3 text-center">
          <BrandLogo url={company?.logo_url as string | undefined} className="mx-auto mb-2 h-12 w-auto max-w-[160px] object-contain" />
          <h1 className="text-base font-bold">{pick(company?.name as string, company?.name_ar as string) || '—'}</h1>
          {company?.tax_number ? <p className="text-xs text-gray-600">{String(company.tax_number)}</p> : null}
          <p className="mt-1 text-sm font-semibold">{t('vanSales.collectDoc.title')}</p>
        </div>

        <div className="space-y-2">
          <Row label={t('vanSales.collectDoc.number')} value={String(col.collection_number ?? '—')} ltr />
          <Row label={t('vanSales.collectDoc.date')} value={formatDate(col.collection_date as string)} />
          {customer ? <Row label={t('vanSales.collectDoc.customer')} value={pick(customer.name as string, customer.name_ar as string) || String(customer.code ?? '—')} /> : null}
          <Row label={t('vanSales.collectDoc.method')} value={String(col.method ?? '—')} />
        </div>

        {allocations.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <div className="text-xs font-semibold text-gray-600">{t('vanSales.collectDoc.applied')}</div>
            {allocations.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span dir="ltr">{t('vanSales.collectDoc.againstInvoice')} {a.number}</span>
                <span className="tabular-nums" dir="ltr">{formatCurrency(a.applied)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1 border-t pt-3">
          {Number(col.unapplied_amount ?? 0) > 0 && (
            <Row label={t('vanSales.collectDoc.onAccount')} value={formatCurrency(Number(col.unapplied_amount))} ltr />
          )}
          <div className="flex items-center justify-between text-base font-bold">
            <span>{t('vanSales.collectDoc.amount')}</span>
            <span className="tabular-nums" dir="ltr">{formatCurrency(Number(col.amount ?? 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
