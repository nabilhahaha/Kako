import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { dailySummaryEnabled } from '@/lib/van-sales/sell';
import { computeDailySummary, type OutcomeEvent } from '@/lib/van-sales/daily-summary';
import type { VisitOutcomeKind } from '@/lib/van-sales/visit-outcome';
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
    supabase.from('erp_visit_outcomes').select('outcome, customer_id, created_at').eq('salesman_id', ctx.userId).eq('visit_date', today),
    supabase.from('erp_invoices').select('net_amount, created_at').eq('created_by', ctx.userId).in('status', ACTIVE_INV).gte('created_at', dayStart),
    supabase.from('erp_collections').select('amount, created_at').eq('received_by', ctx.userId).gte('created_at', dayStart),
    supabase.from('erp_sales_returns').select('created_at').eq('created_by', ctx.userId).gte('created_at', dayStart),
  ]);

  const session = sessionRow.data as { opened_at: string | null; closed_at: string | null; status: string } | null;
  const outcomes: OutcomeEvent[] = ((outcomesRes.data ?? []) as { outcome: string; customer_id: string; created_at: string }[])
    .map((o) => ({ kind: o.outcome as VisitOutcomeKind, customerId: o.customer_id, at: o.created_at }));
  const invoices = ((invRes.data ?? []) as { net_amount: number; created_at: string }[]).map((i) => ({ amount: Number(i.net_amount ?? 0), at: i.created_at }));
  const collections = ((collRes.data ?? []) as { amount: number; created_at: string }[]).map((c) => ({ amount: Number(c.amount ?? 0), at: c.created_at }));
  const returns = ((retRes.data ?? []) as { created_at: string }[]).map((r) => ({ at: r.created_at }));

  const s = computeDailySummary({
    dayOpenedAt: session?.opened_at ?? null,
    dayClosedAt: session?.closed_at ?? null,
    nowIso: new Date().toISOString(),
    outcomes, invoices, collections, returns,
  });

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
