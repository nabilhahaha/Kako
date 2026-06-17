import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { PrintBar } from '@/components/print/print-button';
import { BrandLogo } from '@/components/print/brand-logo';

// Sales return print — return slip (return + lines + products + customer +
// company). Reuses erp_sales_returns/_lines (in production). Additive.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function ReturnPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t, locale } = await getT();
  const supabase = await createClient();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '';

  const ret = await safe(async () => {
    const { data } = await supabase.from('erp_sales_returns').select('return_number, customer_id, invoice_id, total_amount, reason, notes, created_at').eq('id', id).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);
  if (!ret) redirect('/sales/returns');

  const lines = await safe(async () => {
    const { data } = await supabase.from('erp_sales_return_lines').select('product_id, quantity, unit_price, line_total').eq('return_id', id).order('created_at');
    return (data ?? []) as { product_id: string; quantity: number; unit_price: number; line_total: number }[];
  }, []);

  const products = await safe(async () => {
    const ids = [...new Set(lines.map((l) => l.product_id))];
    if (!ids.length) return new Map<string, { name: string; name_ar: string | null }>();
    const { data } = await supabase.from('erp_products_catalog').select('id, name, name_ar').in('id', ids);
    return new Map((data ?? []).map((p) => [(p as { id: string }).id, p as { name: string; name_ar: string | null }]));
  }, new Map<string, { name: string; name_ar: string | null }>());

  const customer = await safe(async () => {
    const { data } = await supabase.from('erp_customers').select('name, name_ar, code, company_id').eq('id', ret.customer_id as string).maybeSingle();
    return data as Record<string, unknown> | null;
  }, null);

  const company = await safe(async () => {
    if (!customer?.company_id) return null;
    const { data } = await supabase.from('erp_companies').select('name, name_ar, tax_number, logo_url').eq('id', customer.company_id as string).maybeSingle();
    return data as { name: string; name_ar: string | null; tax_number: string | null; logo_url: string | null } | null;
  }, null);

  const num = (v: unknown) => Number(v ?? 0);

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <PrintBar printLabel={t('salesman.print')} backHref="/sales/returns" backLabel={t('salesman.back')} />
      <div className="space-y-5 rounded-lg border bg-white p-6 text-black print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <BrandLogo url={company?.logo_url} className="mb-2 h-12 w-auto max-w-[160px] object-contain" />
            <h1 className="text-lg font-bold">{pick(company?.name, company?.name_ar) || '—'}</h1>
            {company?.tax_number ? <p className="text-xs text-gray-600">{company.tax_number}</p> : null}
          </div>
          <div className="text-end">
            <p className="text-base font-bold">{t('vanops.returnTitle')}</p>
            <p className="text-sm font-semibold" dir="ltr">{String(ret.return_number ?? '')}</p>
            <p className="text-xs text-gray-600" dir="ltr">{formatDate(ret.created_at as string)}</p>
          </div>
        </div>

        <div className="text-sm">
          <p className="text-xs font-semibold uppercase text-gray-500">{t('salesman.customer')}</p>
          <p className="font-medium">{pick(customer?.name as string, customer?.name_ar as string) || '—'}</p>
          {ret.reason ? <p className="mt-1 text-xs text-gray-600">{t('vanops.reason')}: {String(ret.reason)}</p> : null}
        </div>

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

        <div className="flex justify-between border-t pt-3 text-base font-bold">
          <span>{t('salesman.total')}</span>
          <span className="tabular-nums" dir="ltr">{formatCurrency(num(ret.total_amount))}</span>
        </div>
      </div>
    </div>
  );
}
