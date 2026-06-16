import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { dailySummaryEnabled } from '@/lib/van-sales/sell';
import { loadDailySummaryBundle } from '@/lib/van-sales/daily-summary-server';
import { noSaleReasonBreakdown, type ActivityRow } from '@/lib/van-sales/daily-summary';
import { NO_SALE_REASONS } from '@/lib/van-sales/visit-outcome';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getT } from '@/lib/i18n/server';

// Printable Daily Summary — same source of truth as the dashboard (shared loader):
// header (company · salesman · date) + KPI totals + activity timeline + sales /
// collection / return totals + no-sales reasons. A salesman prints their own day;
// a supervisor (reports.view) can print any rep via ?rep=.
export default async function DailySummaryPrint({ searchParams }: { searchParams: Promise<{ rep?: string; date?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || '') ? sp.date! : new Date().toISOString().slice(0, 10);
  const self = !sp.rep || sp.rep === ctx.userId;
  const repId = self ? ctx.userId : sp.rep!;
  if (!self && !hasPermission(ctx, 'reports.view') && !ctx.isSuperAdmin) redirect('/dashboard');

  const supabase = await createClient();
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  if (!dailySummaryEnabled(flags)) notFound();

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const money = (n: number) => formatCurrency(n, 'EGP', intl);
  const hhmm = (iso: string | null) => { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };

  const { data: profile } = await supabase.from('erp_profiles').select('full_name, email').eq('id', repId).maybeSingle();
  const repName = (profile as { full_name?: string | null; email?: string | null } | null)?.full_name || (profile as { email?: string } | null)?.email || '—';
  const companyName = ctx.company?.name ?? '—';

  const { summary: s, timeline, totals, route, custName, custCode } = await loadDailySummaryBundle(supabase, repId, date, locale);
  let runAcc = 0;
  const runningSales = timeline.map((r) => { if (r.type === 'invoice') runAcc += r.amount ?? 0; return runAcc; });
  const reasons = noSaleReasonBreakdown(timeline);
  const reasonSet = new Set<string>(NO_SALE_REASONS);
  const reasonLabel = (code: string) => (reasonSet.has(code) ? t(`vanSales.outcome.reason_${code}`) : t(`vanSales.outcome.o_${code}`));
  const statusText = (r: ActivityRow) => (r.type === 'invoice' || r.type === 'collection' || r.type === 'return') ? t('vanSales.dailySummary.statusDone') : (r.reason ? reasonLabel(r.reason) : '—');

  const Kpi = ({ label, value }: { label: string; value: string }) => (
    <div className="rounded border p-2 text-center"><div className="text-[10px] text-gray-500">{label}</div><div className="text-sm font-bold tabular-nums" dir="ltr">{value}</div></div>
  );

  return (
    <div className="space-y-4 text-sm">
      <div className="mb-2 flex justify-end"><PrintButton label={t('vanSales.dailySummary.print')} /></div>

      <div className="border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{companyName}</h1>
        <h2 className="text-base font-semibold">{s.open ? t('vanSales.dailySummary.titleLive') : t('vanSales.dailySummary.titleFinal')}</h2>
        <p className="text-sm">{t('vanSales.dailySummary.colSalesman') ?? ''} <b>{repName}</b> — {formatDate(date, intl)} — {s.open ? t('vanSales.dailySummary.live') : t('vanSales.dailySummary.final')}</p>
        <p className="text-xs text-gray-600">{t('vanSales.dailySummary.openedAt')}: {hhmm(s.dayOpenedAt)} · {t('vanSales.dailySummary.lastActivity')}: {hhmm(s.lastActivityAt)}</p>
      </div>

      {/* KPI totals */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Kpi label={t('vanSales.dailySummary.salesAmount')} value={money(s.salesAmount)} />
        <Kpi label={t('vanSales.dailySummary.collectionAmount')} value={money(s.collectionAmount)} />
        <Kpi label={t('vanSales.dailySummary.visits')} value={String(s.visits)} />
        <Kpi label={t('vanSales.dailySummary.noSaleVisits')} value={String(s.noSaleVisits)} />
        <Kpi label={t('vanSales.dailySummary.routeCompliance')} value={`${route.compliancePct}%`} />
      </div>

      {/* Activity timeline */}
      <div>
        <h3 className="mb-1 font-semibold">{t('vanSales.dailySummary.activityTitle')}</h3>
        <table className="w-full border-collapse">
          <thead><tr className="border-y bg-gray-100">
            <th className="p-1.5 text-start">{t('vanSales.dailySummary.colTime')}</th>
            <th className="p-1.5 text-start">{t('vanSales.dailySummary.colCode')}</th>
            <th className="p-1.5 text-start">{t('vanSales.dailySummary.colCustomer')}</th>
            <th className="p-1.5 text-start">{t('vanSales.dailySummary.colType')}</th>
            <th className="p-1.5 text-start">{t('vanSales.dailySummary.colDoc')}</th>
            <th className="p-1.5 text-end">{t('vanSales.dailySummary.colValue')}</th>
            <th className="p-1.5 text-end">{t('vanSales.dailySummary.colRunning')}</th>
            <th className="p-1.5 text-start">{t('vanSales.dailySummary.colStatusReason')}</th>
          </tr></thead>
          <tbody>
            {timeline.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="p-1.5 tabular-nums" dir="ltr">{hhmm(r.at)}</td>
                <td className="p-1.5 font-mono text-xs" dir="ltr">{custCode.get(r.customerId) ?? '—'}</td>
                <td className="p-1.5">{custName.get(r.customerId) || '—'}</td>
                <td className="p-1.5">{t(`vanSales.dailySummary.type_${r.type}`)}</td>
                <td className="p-1.5 font-mono text-xs" dir="ltr">{r.doc ?? '—'}</td>
                <td className="p-1.5 text-end tabular-nums" dir="ltr">{r.amount != null ? money(r.amount) : '—'}</td>
                <td className="p-1.5 text-end tabular-nums" dir="ltr">{money(runningSales[i])}</td>
                <td className="p-1.5">{statusText(r)}</td>
              </tr>
            ))}
            {timeline.length === 0 && <tr><td colSpan={8} className="p-2 text-center text-gray-500">{t('vanSales.dailySummary.empty')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Totals + no-sales reasons */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 font-semibold">{t('vanSales.dailySummary.totalsTitle')}</h3>
          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-b"><td className="p-1.5">{t('vanSales.dailySummary.totalSales')}</td><td className="p-1.5 text-end tabular-nums" dir="ltr">{money(totals.totalSales)}</td></tr>
              <tr className="border-b"><td className="p-1.5">{t('vanSales.dailySummary.totalCollections')}</td><td className="p-1.5 text-end tabular-nums" dir="ltr">{money(totals.totalCollections)}</td></tr>
              <tr className="border-b"><td className="p-1.5">{t('vanSales.dailySummary.totalReturns')}</td><td className="p-1.5 text-end tabular-nums" dir="ltr">{money(totals.totalReturns)}</td></tr>
              <tr className="border-b"><td className="p-1.5">{t('vanSales.dailySummary.noSalesCount')}</td><td className="p-1.5 text-end tabular-nums" dir="ltr">{totals.noSalesCount}</td></tr>
              <tr className="border-b"><td className="p-1.5">{t('vanSales.dailySummary.closedCount')}</td><td className="p-1.5 text-end tabular-nums" dir="ltr">{totals.closedCount}</td></tr>
              <tr className="border-b"><td className="p-1.5">{t('vanSales.dailySummary.unavailableCount')}</td><td className="p-1.5 text-end tabular-nums" dir="ltr">{totals.unavailableCount}</td></tr>
            </tbody>
          </table>
        </div>
        {reasons.length > 0 && (
          <div>
            <h3 className="mb-1 font-semibold">{t('vanSales.dailySummary.reasonsTitle')}</h3>
            <table className="w-full border-collapse">
              <tbody>
                {reasons.map((r) => (
                  <tr key={r.reason} className="border-b"><td className="p-1.5">{reasonLabel(r.reason)}</td><td className="p-1.5 text-end tabular-nums" dir="ltr">{r.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
