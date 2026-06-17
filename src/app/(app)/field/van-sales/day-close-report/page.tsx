import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { loadDayCloseReport } from '@/lib/van-sales/day-close-server';

export const dynamic = 'force-dynamic';

// Phase D: End Day report — status counts, outstanding cash + aging, variance
// totals, SLA. Gated by reports.view / any day-close stage permission.
export default async function DayCloseReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  const canAny = ['reports.view', 'day.close.supervisor', 'day.close.reconcile', 'day.close.settle']
    .some((p) => hasPermission(ctx, p as Parameters<typeof hasPermission>[1])) || ctx.isSuperAdmin;
  if (!canAny) redirect('/dashboard');

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const cur = (n: number) => formatCurrency(n, 'EGP', intl);
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const from = sp.from || monthAgo;
  const to = sp.to || today;
  const res = await loadDayCloseReport({ from, to });
  const rl = (k: string) => t(`dayCloseReport.${k}`);
  const d = res.ok ? res.data! : null;
  const fmtH = (h: number | null) => (h == null ? '—' : h < 24 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/field/van-sales/day-close-approvals" label={t('common.back')} />
      <PageHeader title={rl('title')} description={rl('subtitle')} />

      <Card><CardContent className="pt-5">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="space-y-1 text-xs"><span className="block text-muted-foreground">{rl('from')}</span>
            <input type="date" name="from" defaultValue={from} className="rounded-md border bg-background px-2 py-1.5 text-sm" /></label>
          <label className="space-y-1 text-xs"><span className="block text-muted-foreground">{rl('to')}</span>
            <input type="date" name="to" defaultValue={to} className="rounded-md border bg-background px-2 py-1.5 text-sm" /></label>
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">{rl('apply')}</button>
        </form>
      </CardContent></Card>

      {!d ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.ok ? rl('empty') : res.error}</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label={rl('pendingSupervisor')} value={String(d.counts.pendingSupervisor)} tone="warning" />
            <Kpi label={rl('pendingReconciliation')} value={String(d.counts.pendingReconciliation)} tone="warning" />
            <Kpi label={rl('pendingSettlement')} value={String(d.counts.pendingSettlement)} tone="warning" />
            <Kpi label={rl('closed')} value={String(d.counts.closed)} tone="success" />
            <Kpi label={rl('rejected')} value={String(d.counts.rejected)} tone="destructive" />
            <Kpi label={rl('avgClose')} value={fmtH(d.sla.avgCloseHours)} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label={rl('outstandingTotal')} value={cur(d.outstanding.total)} sub={`${rl('aged')}: ${d.sla.agedOver24h} / ${d.sla.agedOver48h}`} tone={d.outstanding.total > 0 ? 'destructive' : undefined} />
            <Kpi label={rl('stockVariance')} value={String(Math.round(d.variance.stockTotal * 100) / 100)} />
            <Kpi label={rl('cashVariance')} value={cur(d.variance.cashTotal)} tone={d.variance.cashTotal > 0 ? 'destructive' : undefined} />
          </div>

          <Card><CardContent className="pt-5">
            <h2 className="mb-3 text-sm font-semibold">{rl('outstandingAging')}</h2>
            <div className="grid grid-cols-3 gap-2 text-sm" dir="ltr">
              <Aging label={rl('d0_7')} value={cur(d.outstanding.d0_7)} />
              <Aging label={rl('d8_30')} value={cur(d.outstanding.d8_30)} tone="warning" />
              <Aging label={rl('d31p')} value={cur(d.outstanding.d31p)} tone="destructive" />
            </div>
          </CardContent></Card>

          {d.bySalesman.length > 0 && (
            <Card><CardContent className="pt-5">
              <h2 className="mb-3 text-sm font-semibold">{rl('outstandingBySalesman')}</h2>
              <ul className="divide-y text-sm">
                {d.bySalesman.map((s) => (
                  <li key={s.salesmanId} className="flex items-center justify-between py-1.5">
                    <span className="truncate">{s.salesmanName}</span>
                    <span className="tabular-nums font-medium text-destructive" dir="ltr">{cur(s.outstanding)}</span>
                  </li>
                ))}
              </ul>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warning' | 'success' | 'destructive' }) {
  const cls = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : '';
  return (
    <Card><CardContent className="pt-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${cls}`} dir="ltr">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{sub}</div>}
    </CardContent></Card>
  );
}

function Aging({ label, value, tone }: { label: string; value: string; tone?: 'warning' | 'destructive' }) {
  const cls = tone === 'warning' ? 'text-warning' : tone === 'destructive' ? 'text-destructive' : '';
  return (
    <div className="rounded-md border p-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
