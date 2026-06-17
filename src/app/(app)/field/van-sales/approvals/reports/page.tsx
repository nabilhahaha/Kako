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
import { loadReturnApprovalReport } from '@/lib/van-sales/returns-server';

export const dynamic = 'force-dynamic';

function fmtMins(m: number | null, ar: boolean): string {
  if (m == null) return '—';
  if (m < 60) return ar ? `${Math.round(m)} دقيقة` : `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 48) return ar ? `${h.toFixed(1)} ساعة` : `${h.toFixed(1)}h`;
  return ar ? `${(h / 24).toFixed(1)} يوم` : `${(h / 24).toFixed(1)}d`;
}

// Phase E: Return approval reports — pending/approved/rejected counts + value,
// SLA (avg review/approve, pending >24h/>48h) and value by approver. Gated by
// returns.view_all / returns.approve / reports.view.
export default async function ReturnApprovalReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'returns.view_all') && !hasPermission(ctx, 'returns.approve') && !hasPermission(ctx, 'reports.view') && !ctx.isSuperAdmin) {
    redirect('/dashboard');
  }

  const { t, locale } = await getT();
  const ar = locale === 'ar';
  const intl = INTL_LOCALE[locale];
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const from = sp.from || monthAgo;
  const to = sp.to || today;

  const res = await loadReturnApprovalReport({ from, to });
  const rl = (k: string) => t(`returnReport.${k}`);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/field/van-sales/approvals" label={t('common.back')} />
      <PageHeader title={rl('title')} description={rl('subtitle')} />

      {/* Date range */}
      <Card>
        <CardContent className="pt-5">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <label className="space-y-1 text-xs">
              <span className="block text-muted-foreground">{rl('from')}</span>
              <input type="date" name="from" defaultValue={from} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
            <label className="space-y-1 text-xs">
              <span className="block text-muted-foreground">{rl('to')}</span>
              <input type="date" name="to" defaultValue={to} className="rounded-md border bg-background px-2 py-1.5 text-sm" />
            </label>
            <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">{rl('apply')}</button>
          </form>
        </CardContent>
      </Card>

      {!res.ok || !res.data ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.ok ? rl('empty') : res.error}</CardContent></Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label={rl('pending')} value={String(res.data.counts.pending)} sub={formatCurrency(res.data.value.pending, 'EGP', intl)} tone="warning" />
            <Kpi label={rl('approved')} value={String(res.data.counts.approved)} sub={formatCurrency(res.data.value.approved, 'EGP', intl)} tone="success" />
            <Kpi label={rl('rejected')} value={String(res.data.counts.rejected)} sub={formatCurrency(res.data.value.rejected, 'EGP', intl)} tone="destructive" />
            <Kpi label={rl('avgApprove')} value={fmtMins(res.data.sla.avgApproveMinutes, ar)} />
            <Kpi label={rl('avgReview')} value={fmtMins(res.data.sla.avgReviewMinutes, ar)} />
            <Kpi label={rl('pendingAged')} value={`${res.data.sla.pendingOver24h} / ${res.data.sla.pendingOver48h}`} sub={rl('aged2448')} tone={res.data.sla.pendingOver48h > 0 ? 'destructive' : res.data.sla.pendingOver24h > 0 ? 'warning' : undefined} />
          </div>

          {/* Value by approver */}
          <Card>
            <CardContent className="pt-5">
              <h2 className="mb-3 text-sm font-semibold">{rl('byApprover')}</h2>
              {res.data.byApprover.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">{rl('noDecisions')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 text-start font-medium">{rl('approver')}</th>
                        <th className="py-2 text-end font-medium">{rl('approvedCount')}</th>
                        <th className="py-2 text-end font-medium">{rl('approvedValue')}</th>
                        <th className="py-2 text-end font-medium">{rl('rejectedCount')}</th>
                        <th className="py-2 text-end font-medium">{rl('avgApprove')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.data.byApprover.map((a) => (
                        <tr key={a.approverId} className="border-b last:border-0">
                          <td className="py-2 font-medium">{a.approverName}</td>
                          <td className="py-2 text-end tabular-nums">{a.approvedCount}</td>
                          <td className="py-2 text-end tabular-nums" dir="ltr">{formatCurrency(a.approvedValue, 'EGP', intl)}</td>
                          <td className="py-2 text-end tabular-nums">{a.rejectedCount}</td>
                          <td className="py-2 text-end tabular-nums" dir="ltr">{fmtMins(a.avgApproveMinutes, ar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warning' | 'success' | 'destructive' }) {
  const toneCls = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : tone === 'destructive' ? 'text-destructive' : '';
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`} dir="ltr">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground" dir="ltr">{sub}</div>}
      </CardContent>
    </Card>
  );
}
