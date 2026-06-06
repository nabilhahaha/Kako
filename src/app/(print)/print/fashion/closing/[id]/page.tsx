import { notFound, redirect } from 'next/navigation';
import Image from 'next/image';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { InvoicePrintActions } from '@/components/fashion/invoice-print-actions';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';

interface SessionRow {
  id: string; status: string; opening_float: number; opened_at: string; closed_at: string | null; closed_by: string | null;
  cash_sales: number | null; card_sales: number | null; transfer_sales: number | null; total_expenses: number | null;
  owner_withdrawals: number | null; owner_deposits: number | null; expected_amount: number | null;
  closing_counted: number | null; variance: number | null; carried_forward: number | null; notes: string | null;
  branch: { name: string; name_ar: string | null; company: { name: string; name_ar: string | null; logo_url: string | null; currency: string; address: string | null; phone: string | null } | null } | null;
}

/** Printable / Save-as-PDF Daily Closing Report for one cash session. */
export default async function FashionClosingReportPage({
  params, searchParams,
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

  const { data } = await supabase
    .from('erp_cash_sessions')
    .select('id, status, opening_float, opened_at, closed_at, closed_by, cash_sales, card_sales, transfer_sales, total_expenses, owner_withdrawals, owner_deposits, expected_amount, closing_counted, variance, carried_forward, notes, branch:erp_branches(name, name_ar, company:erp_companies(name, name_ar, logo_url, currency, address, phone))')
    .eq('id', id).maybeSingle();
  if (!data) notFound();
  const s = data as unknown as SessionRow;

  let closerName = '—';
  if (s.closed_by) {
    const { data: closer } = await supabase.from('erp_profiles').select('full_name').eq('id', s.closed_by).maybeSingle();
    closerName = (closer as { full_name: string | null } | null)?.full_name ?? '—';
  }

  const company = s.branch?.company;
  const currency = company?.currency || 'EGP';
  const money = (n: number | null) => formatCurrency(Number(n) || 0, currency, intl);
  const companyName = (locale === 'ar' ? company?.name_ar || company?.name : company?.name) || t('fashion.invoices.company');
  const branchName = (locale === 'ar' ? s.branch?.name_ar || s.branch?.name : s.branch?.name) || '—';
  const variance = Number(s.variance) || 0;

  return (
    <div className="space-y-6 text-sm">
      <style>{`@media print { @page { margin: 10mm; } }`}</style>
      <div className="flex items-start justify-between">
        <InvoicePrintActions autoPrint={autoPrint} />
        <span className={`rounded border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${s.status === 'closed' ? 'border-gray-400 text-gray-500' : 'border-amber-400 text-amber-600'}`}>
          {s.status === 'closed' ? t('fashion.cashbox.final') : t('fashion.cashbox.draft')}
        </span>
      </div>

      <div className="flex items-start gap-3 border-b pb-4">
        {company?.logo_url && <Image src={company.logo_url} alt={companyName} width={56} height={56} className="h-14 w-14 rounded object-contain" unoptimized />}
        <div className="flex-1">
          <h1 className="text-xl font-bold">{companyName}</h1>
          {company?.address && <p className="text-xs text-gray-600">{company.address}</p>}
        </div>
        <div className="text-end">
          <h2 className="text-lg font-bold">{t('fashion.cashbox.reportTitle')}</h2>
          <p className="text-xs text-gray-600">{branchName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-gray-600">
        <p>{t('fashion.cashbox.openedAt')}: <span dir="ltr">{formatDateTime(s.opened_at, intl)}</span></p>
        <p>{t('fashion.cashbox.closedAt')}: <span dir="ltr">{formatDateTime(s.closed_at, intl)}</span></p>
        <p>{t('fashion.cashbox.closedBy')}: {closerName}</p>
      </div>

      <table className="w-full border-collapse">
        <tbody>
          <Line label={t('fashion.cashbox.openingFloat')} value={money(s.opening_float)} />
          <Line label={t('fashion.cashbox.cashSales')} value={money(s.cash_sales)} />
          <Line label={t('fashion.cashbox.cardSales')} value={money(s.card_sales)} />
          <Line label={t('fashion.cashbox.transferSales')} value={money(s.transfer_sales)} />
          <Line label={t('fashion.cashbox.expenses')} value={'-' + money(s.total_expenses)} />
          <Line label={t('fashion.cashbox.ownerDeposits')} value={money(s.owner_deposits)} />
          <Line label={t('fashion.cashbox.ownerWithdrawals')} value={'-' + money(s.owner_withdrawals)} />
          <tr className="border-t font-bold"><td className="p-2">{t('fashion.cashbox.expected')}</td><td className="p-2 text-end tabular-nums" dir="ltr">{money(s.expected_amount)}</td></tr>
          <Line label={t('fashion.cashbox.counted')} value={money(s.closing_counted)} />
          <tr className="border-t font-bold"><td className="p-2">{t('fashion.cashbox.variance')}</td><td className={`p-2 text-end tabular-nums ${variance < 0 ? 'text-red-600' : variance > 0 ? 'text-green-700' : ''}`} dir="ltr">{money(s.variance)}</td></tr>
          <Line label={t('fashion.cashbox.carriedForward')} value={money(s.carried_forward)} />
        </tbody>
      </table>

      {s.notes && <p className="border-t pt-2 text-xs text-gray-600">{t('fashion.cashbox.notes')}: {s.notes}</p>}
      <div className="border-t pt-6 text-center text-xs text-gray-500">{t('fashion.invoices.thanks')}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b">
      <td className="p-2 text-gray-600">{label}</td>
      <td className="p-2 text-end tabular-nums" dir="ltr">{value}</td>
    </tr>
  );
}
