import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { dailySummaryEnabled } from '@/lib/van-sales/sell';
import { loadDailySummaryBundle } from '@/lib/van-sales/daily-summary-server';
import { activityDocHref, noSaleReasonBreakdown, type ActivityRow } from '@/lib/van-sales/daily-summary';
import { NO_SALE_REASONS } from '@/lib/van-sales/visit-outcome';
import { BackLink } from '@/components/shared/back-link';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getT } from '@/lib/i18n/server';
import { Receipt, HandCoins, Users, Ban, MapPin, Printer } from 'lucide-react';

export const dynamic = 'force-dynamic';

function hhmm(iso: string | null, locale: keyof typeof INTL_LOCALE): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

// Daily Summary — the salesman's central operational dashboard ("ملخص اليوم").
// Read-only, from existing data, one source of truth (shared loader). LIVE while
// the day is open, FINAL once closed. Layout: Top (status + times) → Middle (KPI
// cards) → Bottom (chronological activity timeline + totals + no-sales reasons).
// Document numbers + customer names are clickable (drill-down to the document /
// customer). Printable via "طباعة ملخص اليوم".
export default async function DailySummaryPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  if (!dailySummaryEnabled(flags)) notFound();

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];
  const money = (n: number) => formatCurrency(n, 'EGP', intl);
  const today = new Date().toISOString().slice(0, 10);

  const { summary: s, timeline, totals, route, custName, custCode } = await loadDailySummaryBundle(supabase, ctx.userId, today, locale);
  const lastActivity = s.lastActivityAt ? hhmm(s.lastActivityAt, locale) : t('vanSales.dailySummary.sinceOpen');
  const reasons = noSaleReasonBreakdown(timeline);
  const reasonSet = new Set<string>(NO_SALE_REASONS);
  const reasonLabel = (code: string) => (reasonSet.has(code) ? t(`vanSales.outcome.reason_${code}`) : t(`vanSales.outcome.o_${code}`));
  const statusText = (r: ActivityRow): string => {
    if (r.type === 'invoice' || r.type === 'collection' || r.type === 'return') return t('vanSales.dailySummary.statusDone');
    return r.reason ? reasonLabel(r.reason) : '—';
  };
  const typePill = (r: ActivityRow): string => {
    if (r.type === 'invoice') return 'bg-success/15 text-success';
    if (r.type === 'collection') return 'bg-info/15 text-info';
    if (r.type === 'return') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
    if (r.type === 'no_sale') return 'bg-muted text-muted-foreground';
    if (r.reason === 'closed' || r.reason === 'customer_closed') return 'bg-destructive/15 text-destructive';
    return 'bg-warning/15 text-warning';
  };
  const TypeTag = ({ r }: { r: ActivityRow }) => (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${typePill(r)}`}>{t(`vanSales.dailySummary.type_${r.type}`)}</span>
  );
  const DocLink = ({ r }: { r: ActivityRow }) => {
    const href = activityDocHref(r.type, r.docId);
    if (!r.doc) return <span>—</span>;
    return href
      ? <Link href={href} className="font-mono text-xs text-primary underline underline-offset-2" dir="ltr">{r.doc}</Link>
      : <span className="font-mono text-xs" dir="ltr">{r.doc}</span>;
  };
  const CustLink = ({ id }: { id: string }) => (
    <Link href={`/customers/${id}`} className="underline-offset-2 hover:underline">{custName.get(id) || '—'}</Link>
  );
  let runAcc = 0;
  const runningSales = timeline.map((r) => { if (r.type === 'invoice') runAcc += r.amount ?? 0; return runAcc; });
  const complianceTone = route.compliancePct >= 90 ? 'success' : route.compliancePct >= 60 ? 'warning' : 'destructive';

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <BackLink href="/today" label={t('common.back')} />
      <PageHeader
        title={s.open ? t('vanSales.dailySummary.titleLive') : t('vanSales.dailySummary.titleFinal')}
        description={s.open ? t('vanSales.dailySummary.subtitleLive') : t('vanSales.dailySummary.subtitleFinal')}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={s.open ? 'success' : 'secondary'}>{s.open ? t('vanSales.dailySummary.live') : t('vanSales.dailySummary.final')}</Badge>
            <a href={`/print/daily-summary?date=${today}`} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <Printer className="h-4 w-4" /> {t('vanSales.dailySummary.print')}
            </a>
          </div>
        }
      />

      {/* TOP — day timing */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label={t('vanSales.dailySummary.openedAt')} value={hhmm(s.dayOpenedAt, locale)} />
        <Cell label={t('vanSales.dailySummary.closedAt')} value={s.dayClosedAt ? hhmm(s.dayClosedAt, locale) : '—'} />
        <Cell label={t('vanSales.dailySummary.firstActivity')} value={hhmm(s.firstActivityAt, locale)} />
        <Cell label={t('vanSales.dailySummary.lastActivity')} value={lastActivity} />
      </div>

      {/* MIDDLE — primary KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={t('vanSales.dailySummary.salesAmount')} value={money(s.salesAmount)} icon={Receipt} tone="success" />
        <StatCard label={t('vanSales.dailySummary.collectionAmount')} value={money(s.collectionAmount)} icon={HandCoins} tone="success" />
        <StatCard label={t('vanSales.dailySummary.visits')} value={String(s.visits)} icon={Users} tone="info" />
        <StatCard label={t('vanSales.dailySummary.noSaleVisits')} value={String(s.noSaleVisits)} icon={Ban} tone={s.noSaleVisits > 0 ? 'warning' : 'success'} />
        <StatCard label={t('vanSales.dailySummary.routeCompliance')} value={`${route.compliancePct}%`} icon={MapPin} tone={complianceTone} hint={t('vanSales.dailySummary.routeComplianceHint', { visited: route.visited, planned: route.planned })} />
      </div>

      {/* DETAIL — exact metrics */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.dailySummary.exactTitle')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label={t('vanSales.dailySummary.customersVisited')} value={String(s.customersVisited)} />
          <Cell label={t('vanSales.dailySummary.salesVisits')} value={String(s.salesVisits)} />
          <Cell label={t('vanSales.dailySummary.collectionVisits')} value={String(s.collectionVisits)} />
          <Cell label={t('vanSales.dailySummary.returnVisits')} value={String(s.returnVisits)} />
          <Cell label={t('vanSales.dailySummary.invoices')} value={String(s.invoiceCount)} />
          <Cell label={t('vanSales.dailySummary.collections')} value={String(s.collectionCount)} />
          <Cell label={t('vanSales.dailySummary.returns')} value={String(s.returnCount)} />
          <Cell label={t('vanSales.dailySummary.repeatNoSale')} value={String(s.noSaleRepeatCustomers)} tone={s.noSaleRepeatCustomers > 0 ? 'bad' : undefined} />
        </div>
      </section>

      {/* ESTIMATED — gap-based (تقديري) */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('vanSales.dailySummary.estimatedTitle')} <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">{t('vanSales.dailySummary.estimatedTag')}</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Cell label={t('vanSales.dailySummary.idleApprox')} value={s.longestGapMinutes != null ? `${s.longestGapMinutes} ${t('vanSales.dailySummary.minutes')}` : '—'} tone="warn" />
        </div>
        <p className="text-[11px] text-muted-foreground">{t('vanSales.dailySummary.phase2Note')}</p>
      </section>

      {/* BOTTOM — chronological activity report. */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.dailySummary.activityTitle')}</h2>
        <Card><CardContent className="p-0">
          {timeline.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('vanSales.dailySummary.empty')}</p>
          ) : (
            <>
              {/* Mobile */}
              <ul className="divide-y sm:hidden">
                {timeline.map((r, idx) => (
                  <li key={idx} className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium"><CustLink id={r.customerId} />{custCode.get(r.customerId) && <span className="ms-1 font-mono text-[11px] text-muted-foreground" dir="ltr">{custCode.get(r.customerId)}</span>}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">{hhmm(r.at, locale)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0"><TypeTag r={r} /><span className="ms-1"><DocLink r={r} /></span></span>
                      <span className="shrink-0 font-semibold tabular-nums" dir="ltr">{r.amount != null ? money(r.amount) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{statusText(r)}</span>
                      <span dir="ltr">Σ {money(runningSales[idx])}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Desktop */}
              <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colTime')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colCode')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colCustomer')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colType')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colDoc')}</th>
                  <th className="p-2 text-end font-medium">{t('vanSales.dailySummary.colValue')}</th>
                  <th className="p-2 text-end font-medium">{t('vanSales.dailySummary.colRunning')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colStatusReason')}</th>
                </tr></thead>
                <tbody>
                  {timeline.map((r, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="p-2 text-muted-foreground tabular-nums" dir="ltr">{hhmm(r.at, locale)}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground" dir="ltr">{custCode.get(r.customerId) ?? '—'}</td>
                      <td className="p-2"><CustLink id={r.customerId} /></td>
                      <td className="p-2"><TypeTag r={r} /></td>
                      <td className="break-all p-2"><DocLink r={r} /></td>
                      <td className="p-2 text-end tabular-nums" dir="ltr">{r.amount != null ? money(r.amount) : '—'}</td>
                      <td className="p-2 text-end tabular-nums text-muted-foreground" dir="ltr">{money(runningSales[idx])}</td>
                      <td className="p-2 text-muted-foreground">{statusText(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}
        </CardContent></Card>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Cell label={t('vanSales.dailySummary.totalSales')} value={money(totals.totalSales)} tone="ok" />
          <Cell label={t('vanSales.dailySummary.totalCollections')} value={money(totals.totalCollections)} tone="ok" />
          <Cell label={t('vanSales.dailySummary.totalReturns')} value={money(totals.totalReturns)} />
          <Cell label={t('vanSales.dailySummary.noSalesCount')} value={String(totals.noSalesCount)} tone={totals.noSalesCount > 0 ? 'warn' : undefined} />
          <Cell label={t('vanSales.dailySummary.closedCount')} value={String(totals.closedCount)} tone={totals.closedCount > 0 ? 'bad' : undefined} />
          <Cell label={t('vanSales.dailySummary.unavailableCount')} value={String(totals.unavailableCount)} tone={totals.unavailableCount > 0 ? 'warn' : undefined} />
        </div>
      </section>

      {/* No-sales reasons summary */}
      {reasons.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.dailySummary.reasonsTitle')}</h2>
          <Card><CardContent className="p-3">
            <ul className="space-y-1">
              {reasons.map((r) => (
                <li key={r.reason} className="flex items-center justify-between gap-2 text-sm">
                  <span>{reasonLabel(r.reason)}</span>
                  <span className="font-semibold tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </CardContent></Card>
        </section>
      )}
    </div>
  );
}

const TONE: Record<'warn' | 'ok' | 'bad', string> = { warn: 'text-warning', ok: 'text-success', bad: 'text-destructive' };
function Cell({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' | 'bad' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
        <p className={`truncate text-base font-bold tabular-nums ${tone ? TONE[tone] : ''}`} dir="ltr">{value}</p>
      </CardContent>
    </Card>
  );
}
