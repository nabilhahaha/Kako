import { notFound, redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PrintButton } from '@/components/print-button';
import { BrandLogo } from '@/components/print/brand-logo';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * Printable shift-close receipt — the "Print now?" target offered by the
 * Critical Action standard after a shift is closed. RLS scopes the session to
 * the caller's tenant; the page renders opening float, expected/counted cash,
 * variance and the cashier, then offers a manual print button.
 */
export default async function ShiftReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const intl = INTL_LOCALE[locale];
  const money = (n: number | null | undefined) => formatCurrency(Number(n ?? 0), 'EGP', intl);

  const supabase = await createClient();
  const { data: sessRaw } = await supabase
    .from('erp_cash_sessions')
    .select('id, opening_float, expected_amount, closing_counted, variance, opened_at, closed_at, closed_by, branch:erp_branches(name, name_ar, company:erp_companies(name, name_ar, logo_url, currency))')
    .eq('id', id)
    .maybeSingle();
  if (!sessRaw) notFound();

  const s = sessRaw as unknown as {
    id: string; opening_float: number; expected_amount: number | null;
    closing_counted: number | null; variance: number | null;
    opened_at: string; closed_at: string | null; closed_by: string | null;
    branch: {
      name: string; name_ar: string | null;
      company: { name: string; name_ar: string | null; logo_url: string | null; currency: string } | null;
    } | null;
  };

  let cashier = '—';
  if (s.closed_by) {
    const { data: p } = await supabase
      .from('erp_profiles').select('full_name, email').eq('id', s.closed_by).maybeSingle();
    const prof = p as { full_name: string | null; email: string | null } | null;
    cashier = prof?.full_name?.trim() || prof?.email || '—';
  }

  const company = s.branch?.company;
  const variance = Number(s.variance ?? 0);

  return (
    <div className="mx-auto max-w-md space-y-5 text-sm">
      <div className="mb-2 flex justify-end">
        <PrintButton />
      </div>

      <div className="flex items-start justify-between border-b pb-4">
        <div>
          <BrandLogo url={company?.logo_url} className="mb-2 h-12 w-auto max-w-[160px] object-contain" />
          <h1 className="text-lg font-bold">{company?.name_ar || company?.name || '—'}</h1>
          <p className="text-xs text-gray-600">{s.branch?.name_ar || s.branch?.name || ''}</p>
        </div>
        <div className="text-end">
          <h2 className="text-base font-bold">{t('cashbox.receiptTitle')}</h2>
          <p className="font-mono text-xs text-gray-500" dir="ltr">{s.id.slice(0, 8)}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <Row label={t('cashbox.openedAt')} value={formatDate(s.opened_at, intl)} />
          <Row label={t('cashbox.histClosedAt')} value={formatDate(s.closed_at, intl)} />
          <Row label={t('cashbox.histClosedBy')} value={cashier} />
          <tr className="border-t"><td className="py-2 text-gray-600">{t('cashbox.openingFloat')}</td><td className="py-2 text-end tabular-nums" dir="ltr">{money(s.opening_float)}</td></tr>
          <Row label={t('cashbox.expected')} value={money(s.expected_amount)} />
          <Row label={t('cashbox.counted')} value={money(s.closing_counted)} />
          <tr className="border-t font-bold">
            <td className="py-2">{t('cashbox.variance')}</td>
            <td className="py-2 text-end tabular-nums" dir="ltr">
              {money(variance)} {variance > 0 ? t('cashbox.over') : variance < 0 ? t('cashbox.short') : t('cashbox.balanced')}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-6 border-t pt-8 text-center text-xs text-gray-500">
        <div>______________________<br />{t('cashbox.histClosedBy')}</div>
        <div>______________________<br />{t('cashbox.openedBy')}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-2 text-gray-600">{label}</td>
      <td className="py-2 text-end tabular-nums" dir="ltr">{value}</td>
    </tr>
  );
}
