import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { dailySummaryEnabled } from '@/lib/van-sales/sell';
import { computeDailySummary, buildActivityTimeline, activityTotals, type OutcomeEvent, type ActivityRow } from '@/lib/van-sales/daily-summary';
import { TXN_OUTCOMES, NO_SALE_REASONS, type VisitOutcomeKind } from '@/lib/van-sales/visit-outcome';
import { BackLink } from '@/components/shared/back-link';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

const ACTIVE_INV = ['issued', 'paid', 'partially_paid', 'overdue'];

function hhmm(iso: string | null, locale: keyof typeof INTL_LOCALE): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

// Salesman "ملخص اليوم" (Daily Summary, Phase 1) — READ-ONLY, from existing data.
// LIVE while the day is open ("حتى الآن"), FINAL once closed ("النهائي"). Exact
// metrics (counts/amounts/times) are separated from ESTIMATED ones (gap-based,
// tagged تقديري). Durations / productive hours arrive in Phase 2.
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
  const dayStart = `${today}T00:00:00`;

  const [sessionRow, outcomesRes, invRes, collRes, retRes] = await Promise.all([
    supabase.from('erp_work_sessions').select('opened_at, closed_at, status').eq('salesman_id', ctx.userId).eq('work_date', today).maybeSingle(),
    supabase.from('erp_visit_outcomes').select('outcome, reason, customer_id, created_at').eq('salesman_id', ctx.userId).eq('visit_date', today),
    supabase.from('erp_invoices').select('invoice_number, customer_id, net_amount, created_at').eq('created_by', ctx.userId).in('status', ACTIVE_INV).gte('created_at', dayStart),
    supabase.from('erp_collections').select('collection_number, customer_id, amount, created_at').eq('received_by', ctx.userId).gte('created_at', dayStart),
    supabase.from('erp_sales_returns').select('return_number, customer_id, total_amount, created_at').eq('created_by', ctx.userId).gte('created_at', dayStart),
  ]);

  const session = sessionRow.data as { opened_at: string | null; closed_at: string | null; status: string } | null;
  const outcomeRows = (outcomesRes.data ?? []) as { outcome: string; reason: string | null; customer_id: string; created_at: string }[];
  const invRows = (invRes.data ?? []) as { invoice_number: string; customer_id: string; net_amount: number; created_at: string }[];
  const collRows = (collRes.data ?? []) as { collection_number: string; customer_id: string; amount: number; created_at: string }[];
  const retRows = (retRes.data ?? []) as { return_number: string; customer_id: string; total_amount: number; created_at: string }[];

  const outcomes: OutcomeEvent[] = outcomeRows.map((o) => ({ kind: o.outcome as VisitOutcomeKind, customerId: o.customer_id, at: o.created_at }));

  const s = computeDailySummary({
    dayOpenedAt: session?.opened_at ?? null,
    dayClosedAt: session?.closed_at ?? null,
    nowIso: new Date().toISOString(),
    outcomes,
    invoices: invRows.map((i) => ({ amount: Number(i.net_amount ?? 0), at: i.created_at })),
    collections: collRows.map((c) => ({ amount: Number(c.amount ?? 0), at: c.created_at })),
    returns: retRows.map((r) => ({ at: r.created_at })),
  });

  // Chronological activity timeline (documents + non-transaction visit outcomes).
  const txn = new Set<string>(TXN_OUTCOMES);
  const timeline = buildActivityTimeline({
    invoices: invRows.map((i) => ({ customerId: i.customer_id, number: i.invoice_number, amount: Number(i.net_amount ?? 0), at: i.created_at })),
    collections: collRows.map((c) => ({ customerId: c.customer_id, number: c.collection_number, amount: Number(c.amount ?? 0), at: c.created_at })),
    returns: retRows.map((r) => ({ customerId: r.customer_id, number: r.return_number, amount: Number(r.total_amount ?? 0), at: r.created_at })),
    outcomes: outcomeRows.filter((o) => !txn.has(o.outcome)).map((o) => ({ customerId: o.customer_id, outcome: o.outcome as VisitOutcomeKind, reason: o.reason, at: o.created_at })),
  });
  const totals = activityTotals(timeline);

  // Resolve customer names + codes for the timeline (one scoped query).
  const custIds = Array.from(new Set(timeline.map((r) => r.customerId)));
  const custName = new Map<string, string>();
  const custCode = new Map<string, string>();
  if (custIds.length > 0) {
    const { data: custs } = await supabase.from('erp_customers').select('id, name, name_ar, code').in('id', custIds);
    for (const c of (custs as { id: string; name: string; name_ar: string | null; code: string | null }[]) ?? []) {
      custName.set(c.id, locale === 'ar' ? c.name_ar || c.name : c.name);
      if (c.code) custCode.set(c.id, c.code);
    }
  }
  // Running daily sales total (cumulative invoice value down the chronological list).
  let runAcc = 0;
  const runningSales = timeline.map((r) => { if (r.type === 'invoice') runAcc += r.amount ?? 0; return runAcc; });
  const reasonSet = new Set<string>(NO_SALE_REASONS);
  const statusText = (r: ActivityRow): string => {
    if (r.type === 'invoice' || r.type === 'collection' || r.type === 'return') return t('vanSales.dailySummary.statusDone');
    if (!r.reason) return '—';
    return reasonSet.has(r.reason) ? t(`vanSales.outcome.reason_${r.reason}`) : t(`vanSales.outcome.o_${r.reason}`);
  };
  // Colour-coded activity type: Sale=green · Collection=blue · Return=orange ·
  // No-sale=gray · Customer closed=red · Customer unavailable=yellow.
  const typePill = (r: ActivityRow): string => {
    if (r.type === 'invoice') return 'bg-success/15 text-success';
    if (r.type === 'collection') return 'bg-info/15 text-info';
    if (r.type === 'return') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
    if (r.type === 'no_sale') return 'bg-muted text-muted-foreground';
    if (r.reason === 'closed' || r.reason === 'customer_closed') return 'bg-destructive/15 text-destructive';
    return 'bg-warning/15 text-warning'; // not_available / gps_exception
  };
  const TypeTag = ({ r }: { r: ActivityRow }) => (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${typePill(r)}`}>{t(`vanSales.dailySummary.type_${r.type}`)}</span>
  );

  const lastActivity = s.lastActivityAt ? hhmm(s.lastActivityAt, locale) : t('vanSales.dailySummary.sinceOpen');

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <BackLink href="/today" label={t('common.back')} />
      <PageHeader
        title={s.open ? t('vanSales.dailySummary.titleLive') : t('vanSales.dailySummary.titleFinal')}
        description={s.open ? t('vanSales.dailySummary.subtitleLive') : t('vanSales.dailySummary.subtitleFinal')}
        action={<Badge variant={s.open ? 'success' : 'secondary'}>{s.open ? t('vanSales.dailySummary.live') : t('vanSales.dailySummary.final')}</Badge>}
      />

      {/* Day timing */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label={t('vanSales.dailySummary.openedAt')} value={hhmm(s.dayOpenedAt, locale)} />
        <Cell label={t('vanSales.dailySummary.closedAt')} value={s.dayClosedAt ? hhmm(s.dayClosedAt, locale) : '—'} />
        <Cell label={t('vanSales.dailySummary.firstActivity')} value={hhmm(s.firstActivityAt, locale)} />
        <Cell label={t('vanSales.dailySummary.lastActivity')} value={lastActivity} />
      </div>

      {/* EXACT METRICS */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.dailySummary.exactTitle')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Cell label={t('vanSales.dailySummary.visits')} value={String(s.visits)} />
          <Cell label={t('vanSales.dailySummary.customersVisited')} value={String(s.customersVisited)} />
          <Cell label={t('vanSales.dailySummary.salesVisits')} value={String(s.salesVisits)} tone="ok" />
          <Cell label={t('vanSales.dailySummary.collectionVisits')} value={String(s.collectionVisits)} />
          <Cell label={t('vanSales.dailySummary.returnVisits')} value={String(s.returnVisits)} />
          <Cell label={t('vanSales.dailySummary.noSaleVisits')} value={String(s.noSaleVisits)} tone={s.noSaleVisits > 0 ? 'warn' : undefined} />
          <Cell label={t('vanSales.dailySummary.salesCustomers')} value={String(s.salesCustomers)} />
          <Cell label={t('vanSales.dailySummary.collectionCustomers')} value={String(s.collectionCustomers)} />
          <Cell label={t('vanSales.dailySummary.noSaleCustomers')} value={String(s.noSaleCustomers)} />
          <Cell label={t('vanSales.dailySummary.salesAmount')} value={money(s.salesAmount)} tone="ok" />
          <Cell label={t('vanSales.dailySummary.collectionAmount')} value={money(s.collectionAmount)} tone="ok" />
          <Cell label={t('vanSales.dailySummary.invoices')} value={String(s.invoiceCount)} />
          <Cell label={t('vanSales.dailySummary.collections')} value={String(s.collectionCount)} />
          <Cell label={t('vanSales.dailySummary.returns')} value={String(s.returnCount)} />
          <Cell label={t('vanSales.dailySummary.repeatNoSale')} value={String(s.noSaleRepeatCustomers)} tone={s.noSaleRepeatCustomers > 0 ? 'bad' : undefined} />
        </div>
      </section>

      {/* ESTIMATED METRICS — explicitly tagged تقديري; not exact measurements. */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('vanSales.dailySummary.estimatedTitle')} <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">{t('vanSales.dailySummary.estimatedTag')}</span>
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Cell label={t('vanSales.dailySummary.idleApprox')} value={s.longestGapMinutes != null ? `${s.longestGapMinutes} ${t('vanSales.dailySummary.minutes')}` : '—'} tone="warn" />
        </div>
        <p className="text-[11px] text-muted-foreground">{t('vanSales.dailySummary.estimatedNote')}</p>
        <p className="text-[11px] text-muted-foreground">{t('vanSales.dailySummary.phase2Note')}</p>
      </section>

      {/* DAY ACTIVITY — one chronological report (not cards). */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('vanSales.dailySummary.activityTitle')}</h2>
        <Card><CardContent className="p-0">
          {timeline.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('vanSales.dailySummary.empty')}</p>
          ) : (
            <>
              {/* Mobile: stacked rows. */}
              <ul className="divide-y sm:hidden">
                {timeline.map((r, idx) => (
                  <li key={idx} className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{custName.get(r.customerId) || '—'}{custCode.get(r.customerId) && <span className="ms-1 font-mono text-[11px] text-muted-foreground" dir="ltr">{custCode.get(r.customerId)}</span>}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">{hhmm(r.at, locale)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0"><TypeTag r={r} />{r.doc && <span className="ms-1 font-mono text-xs" dir="ltr">{r.doc}</span>}</span>
                      <span className="shrink-0 font-semibold tabular-nums" dir="ltr">{r.amount != null ? money(r.amount) : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{statusText(r)}</span>
                      <span dir="ltr">Σ {money(runningSales[idx])}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Desktop: table. */}
              <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colTime')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colCode')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colCustomer')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colType')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colDoc')}</th>
                  <th className="p-2 text-end font-medium">{t('vanSales.dailySummary.colValue')}</th>
                  <th className="p-2 text-end font-medium">{t('vanSales.dailySummary.colRunning')}</th>
                  <th className="p-2 text-center font-medium">{t('vanSales.dailySummary.colDuration')}</th>
                  <th className="p-2 text-start font-medium">{t('vanSales.dailySummary.colStatusReason')}</th>
                </tr></thead>
                <tbody>
                  {timeline.map((r, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="p-2 text-muted-foreground tabular-nums" dir="ltr">{hhmm(r.at, locale)}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground" dir="ltr">{custCode.get(r.customerId) ?? '—'}</td>
                      <td className="p-2">{custName.get(r.customerId) || '—'}</td>
                      <td className="p-2"><TypeTag r={r} /></td>
                      <td className="break-all p-2 font-mono text-xs" dir="ltr">{r.doc ?? '—'}</td>
                      <td className="p-2 text-end tabular-nums" dir="ltr">{r.amount != null ? money(r.amount) : '—'}</td>
                      <td className="p-2 text-end tabular-nums text-muted-foreground" dir="ltr">{money(runningSales[idx])}</td>
                      <td className="p-2 text-center text-muted-foreground">—</td>
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
