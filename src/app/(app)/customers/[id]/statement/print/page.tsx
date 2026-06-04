import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-button';

// Customer account statement — print/export-friendly ledger (invoices as debit,
// payments as credit, running + outstanding balance). Reuses existing data
// (RLS-scoped). Additive; no schema change. Opening balance is not separately
// stored — see SALESMAN-APP-SPRINT.md (documented data gap).

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

interface Entry { date: string; desc: string; debit: number; credit: number }

export default async function StatementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();
  const supabase = await createClient();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '';

  const customer = await safe(async () => {
    const { data } = await supabase.from('erp_customers').select('name, name_ar, code, tax_number, balance, company_id').eq('id', id).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);
  if (!customer) redirect(`/customers/${id}`);

  const company = await safe(async () => {
    if (!customer.company_id) return null;
    const { data } = await supabase.from('erp_companies').select('name, name_ar').eq('id', customer.company_id as string).maybeSingle();
    return data as { name: string; name_ar: string | null } | null;
  }, null);

  const invoices = await safe(async () => {
    const { data } = await supabase.from('erp_invoices').select('id, invoice_number, net_amount, created_at').eq('customer_id', id).order('created_at');
    return (data ?? []) as { id: string; invoice_number: string; net_amount: number | null; created_at: string }[];
  }, []);

  const payments = await safe(async () => {
    const ids = invoices.map((i) => i.id);
    if (!ids.length) return [];
    const { data } = await supabase.from('erp_payments').select('amount, created_at, reference_number').in('invoice_id', ids).order('created_at');
    return (data ?? []) as { amount: number | null; created_at: string; reference_number: string | null }[];
  }, []);

  const entries: Entry[] = [
    ...invoices.map((i) => ({ date: i.created_at, desc: `${t('salesman.invoiceLabel')} ${i.invoice_number}`, debit: Number(i.net_amount ?? 0), credit: 0 })),
    ...payments.map((p) => ({ date: p.created_at, desc: `${t('salesman.paymentLabel')}${p.reference_number ? ` ${p.reference_number}` : ''}`, debit: 0, credit: Number(p.amount ?? 0) })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let running = 0;
  const rows = entries.map((e) => { running += e.debit - e.credit; return { ...e, balance: running }; });
  const outstanding = Number(customer.balance ?? running);

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <PrintBar printLabel={t('salesman.print')} backHref={`/customers/${id}`} backLabel={t('salesman.back')} />

      <div className="space-y-5 rounded-lg border bg-white p-6 text-black print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-lg font-bold">{pick(company?.name, company?.name_ar) || '—'}</h1>
            <p className="text-sm font-semibold">{t('salesman.statementTitle')}</p>
          </div>
          <div className="text-end text-sm">
            <p className="font-medium">{pick(customer.name as string, customer.name_ar as string)}</p>
            {customer.code ? <p className="text-xs text-gray-600" dir="ltr">{String(customer.code)}</p> : null}
            <p className="text-xs text-gray-600" dir="ltr">{formatDate(new Date().toISOString())}</p>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y text-xs uppercase text-gray-500">
              <th className="py-1.5 text-start font-semibold">{t('salesman.date')}</th>
              <th className="py-1.5 text-start font-semibold">{t('salesman.description')}</th>
              <th className="py-1.5 text-end font-semibold">{t('salesman.debit')}</th>
              <th className="py-1.5 text-end font-semibold">{t('salesman.credit')}</th>
              <th className="py-1.5 text-end font-semibold">{t('salesman.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-gray-400">{t('salesman.noEntries')}</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1.5 whitespace-nowrap" dir="ltr">{formatDate(r.date)}</td>
                <td className="py-1.5">{r.desc}</td>
                <td className="py-1.5 text-end tabular-nums" dir="ltr">{r.debit ? formatCurrency(r.debit) : ''}</td>
                <td className="py-1.5 text-end tabular-nums" dir="ltr">{r.credit ? formatCurrency(r.credit) : ''}</td>
                <td className="py-1.5 text-end tabular-nums" dir="ltr">{formatCurrency(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between border-t pt-3 text-base font-bold">
          <span>{t('salesman.outstanding')}</span>
          <span className="tabular-nums" dir="ltr">{formatCurrency(outstanding)}</span>
        </div>
        <p className="text-[11px] text-gray-500">{t('salesman.openingNote')}</p>
      </div>
    </div>
  );
}
