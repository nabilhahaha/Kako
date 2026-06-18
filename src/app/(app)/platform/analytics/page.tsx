import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CircleSlash,
  Users,
  Network,
  TrendingUp,
  PieChart,
  CreditCard,
  Boxes,
  Tags,
  ArrowRight,
} from 'lucide-react';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { ModulePage } from '@/components/admin/module-page';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import { BUSINESS_TYPE_LABELS } from '@/lib/erp/subscription';
import { formatMoney } from '@/lib/erp/billing';
import { MODULE_LABELS } from '@/lib/erp/navigation';
import { GrowthChart, RankedBars, type SeriesPoint, type RankedItem } from './analytics-charts';
import { RangeSelector, GROWTH_RANGES, type GrowthRange } from './range-selector';
import type { SearchParams } from '@/lib/list-params';
import { param } from '@/lib/list-params';

// ─────────────────────────────────────────────────────────────────────────────
// Platform Analytics Dashboard (Platform Owner only) — READ-ONLY.
//
// A cross-tenant, bird's-eye view composed from a small number of CHEAP queries:
//   • head-only `count` probes for the headline KPIs,
//   • a handful of ranged `created_at` count probes for the signup time-series
//     (no SQL group-by, no RPC, no view),
//   • bounded `select`s (capped with .limit) for breakdowns that we tally in JS.
//
// It mutates nothing and adds no schema. Every metric degrades gracefully (a
// failed query becomes null → its section shows an "unavailable"/empty note).
// Layout is Attention (KPIs) → Information (growth, mix, revenue) → Details
// (modules, business types), mobile-first (cards/charts stack, no h-scroll).
// ─────────────────────────────────────────────────────────────────────────────

/** Count helper: returns null (not 0) on error so a metric is omitted, not faked. */
async function safeCount(
  fn: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number | null> {
  try {
    const { count, error } = await fn();
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/** Bounded row read: null on error so the caller can degrade the section. */
async function safeRows<T>(
  fn: () => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  try {
    const { data, error } = await fn();
    if (error) return null;
    return data ?? [];
  } catch {
    return null;
  }
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const RANGE_MONTHS: Record<GrowthRange, number> = { '30': 1, '90': 3, '180': 6 };

export default async function PlatformAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { t, locale } = await getT();
  const pctx = await getPlatformContext();
  if (!pctx) redirect('/login');

  if (!pctx.isOwner) {
    return (
      <ModulePage title={t('platformAnalytics.title')}>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platformAnalytics.ownerOnly')}
          </CardContent>
        </Card>
      </ModulePage>
    );
  }

  const supabase = await createClient();
  const sp = (await searchParams) ?? {};
  const rangeRaw = param(sp, 'range');
  const range: GrowthRange = GROWTH_RANGES.includes(rangeRaw as GrowthRange) ? (rangeRaw as GrowthRange) : '90';

  const nf = (v: number) => formatNumber(v, locale === 'ar' ? 'ar-EG' : 'en');
  const today = new Date().toISOString().slice(0, 10);
  const soon14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  // ── T1 headline KPIs (head-only counts; no rows fetched) ──────────────────
  // erp_companies.{is_active, subscription_end}; erp_billing_subscriptions.status.
  const [
    totalCompanies,
    activeCompanies,
    trialSubs,
    expiringCompanies,
    expiredCompanies,
    totalUsersRaw,
    totalBranches,
  ] = await Promise.all([
    safeCount(() => supabase.from('erp_companies').select('id', { count: 'exact', head: true })),
    safeCount(() =>
      supabase.from('erp_companies').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ),
    safeCount(() =>
      supabase.from('erp_billing_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'trial'),
    ),
    // Active companies whose subscription_end falls inside the next 14 days.
    safeCount(() =>
      supabase
        .from('erp_companies')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('subscription_end', today)
        .lte('subscription_end', soon14),
    ),
    // Active companies past their subscription_end (expired) + inactive (suspended).
    safeCount(() =>
      supabase
        .from('erp_companies')
        .select('id', { count: 'exact', head: true })
        .or(`subscription_end.lt.${today},is_active.eq.false`),
    ),
    // Distinct users approximated by user_branches rows (deduped from a bounded read below).
    safeRows<{ user_id: string }>(() =>
      supabase.from('erp_user_branches').select('user_id').limit(20000),
    ),
    safeCount(() => supabase.from('erp_branches').select('id', { count: 'exact', head: true })),
  ]);

  const totalUsers = totalUsersRaw ? new Set(totalUsersRaw.map((u) => u.user_id)).size : null;

  // ── Growth: signups per month over the selected window (ranged COUNT probes) ─
  // A handful of created_at gte/lt count queries — deliberately NOT a group-by.
  const months = RANGE_MONTHS[range];
  const base = startOfMonth(new Date());
  const monthEdges: { start: Date; end: Date }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const end = new Date(base.getFullYear(), base.getMonth() - i + 1, 1);
    monthEdges.push({ start, end });
  }
  const monthCounts = await Promise.all(
    monthEdges.map(({ start, end }) =>
      safeCount(() =>
        supabase
          .from('erp_companies')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString()),
      ),
    ),
  );
  const monthFmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', { month: 'short' });
  const growthPoints: SeriesPoint[] = monthEdges.map((m, i) => ({
    label: monthFmt.format(m.start),
    value: monthCounts[i] ?? 0,
  }));
  const growthHasData = monthCounts.some((c) => (c ?? 0) > 0);

  // ── Subscription mix + per-currency revenue (one bounded select) ──────────
  // erp_billing_subscriptions.{status, currency, plan_key, interval} — capped.
  const subRows = await safeRows<{
    status: string;
    currency: string | null;
    plan_key: string | null;
    interval: string | null;
  }>(() =>
    supabase
      .from('erp_billing_subscriptions')
      .select('status, currency, plan_key, interval')
      .limit(10000),
  );

  const mixCounts: Record<string, number> = {};
  for (const s of subRows ?? []) mixCounts[s.status] = (mixCounts[s.status] ?? 0) + 1;
  const MIX_ORDER = ['active', 'trial', 'expired', 'suspended', 'cancelled'] as const;
  const MIX_TONE: Record<string, string> = {
    active: 'h-full rounded-full bg-success',
    trial: 'h-full rounded-full bg-info',
    expired: 'h-full rounded-full bg-destructive',
    suspended: 'h-full rounded-full bg-warning',
    cancelled: 'h-full rounded-full bg-muted-foreground',
  };
  const mixItems: RankedItem[] = MIX_ORDER.filter((k) => (mixCounts[k] ?? 0) > 0).map((k) => ({
    label: t(`platformAnalytics.mix_${k}`),
    value: mixCounts[k] ?? 0,
    barClassName: MIX_TONE[k],
  }));

  // ── Revenue per currency (NEVER summed across currencies) ─────────────────
  // Active-subscription monthly value = matching erp_billing_plan_prices.amount_minor.
  // Yearly intervals are annualised /12 to a comparable monthly figure.
  const priceRows = await safeRows<{
    plan_key: string;
    currency: string;
    interval: string;
    amount_minor: number;
    is_active: boolean;
  }>(() =>
    supabase
      .from('erp_billing_plan_prices')
      .select('plan_key, currency, interval, amount_minor, is_active')
      .eq('is_active', true)
      .limit(2000),
  );

  const priceFor = new Map<string, number>(); // `${plan}|${currency}|${interval}` → amount_minor
  for (const p of priceRows ?? []) priceFor.set(`${p.plan_key}|${p.currency}|${p.interval}`, Number(p.amount_minor ?? 0));

  const mrrByCurrency: Record<string, number> = {};
  const paidSubsByCurrency: Record<string, number> = {};
  let revenueDerivable = false;
  for (const s of subRows ?? []) {
    if (s.status !== 'active') continue;
    if (!s.currency || !s.plan_key || !s.interval) continue;
    paidSubsByCurrency[s.currency] = (paidSubsByCurrency[s.currency] ?? 0) + 1;
    const amount = priceFor.get(`${s.plan_key}|${s.currency}|${s.interval}`);
    if (amount && amount > 0) {
      const monthly = s.interval === 'yearly' ? Math.round(amount / 12) : amount;
      mrrByCurrency[s.currency] = (mrrByCurrency[s.currency] ?? 0) + monthly;
      revenueDerivable = true;
    }
  }
  // If prices weren't resolvable (no matching active price), fall back to counts.
  const revenueEntries = Object.entries(mrrByCurrency).sort((a, b) => b[1] - a[1]);
  const paidCountEntries = Object.entries(paidSubsByCurrency).sort((a, b) => b[1] - a[1]);
  const revenueUnavailable = subRows === null;

  // ── Module adoption: top enabled modules across companies (bounded select) ─
  // erp_company_modules.{module, enabled} — tally enabled rows per module in JS.
  const moduleRows = await safeRows<{ module: string; enabled: boolean }>(() =>
    supabase.from('erp_company_modules').select('module, enabled').eq('enabled', true).limit(20000),
  );
  const moduleCounts: Record<string, number> = {};
  for (const m of moduleRows ?? []) moduleCounts[m.module] = (moduleCounts[m.module] ?? 0) + 1;
  const moduleItems: RankedItem[] = Object.entries(moduleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([mod, count]) => ({
      label: (MODULE_LABELS as Record<string, { en: string; ar: string }>)[mod]?.[locale] ?? mod,
      value: count,
    }));

  // ── Business-type distribution (bounded select on erp_companies.business_type) ─
  const typeRows = await safeRows<{ business_type: string | null }>(() =>
    supabase.from('erp_companies').select('business_type').limit(20000),
  );
  const typeCounts: Record<string, number> = {};
  for (const c of typeRows ?? []) {
    const key = c.business_type ?? '__none__';
    typeCounts[key] = (typeCounts[key] ?? 0) + 1;
  }
  const typeItems: RankedItem[] = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({
      label:
        key === '__none__'
          ? t('platformAnalytics.typeUnknown')
          : (BUSINESS_TYPE_LABELS[key as keyof typeof BUSINESS_TYPE_LABELS]?.[locale] ?? key),
      value: count,
    }));

  // ── KPI tones reflect portfolio health ─────────────────────────────────────
  const kpis: { label: string; value: number | null; icon: typeof Building2; tone: StatTone }[] = [
    { label: t('platformAnalytics.statTotalCompanies'), value: totalCompanies, icon: Building2, tone: 'primary' },
    { label: t('platformAnalytics.statActive'), value: activeCompanies, icon: CheckCircle2, tone: 'success' },
    { label: t('platformAnalytics.statTrial'), value: trialSubs, icon: Clock, tone: 'info' },
    { label: t('platformAnalytics.statExpiring'), value: expiringCompanies, icon: AlertTriangle, tone: 'warning' },
    { label: t('platformAnalytics.statExpired'), value: expiredCompanies, icon: CircleSlash, tone: 'destructive' },
    { label: t('platformAnalytics.statTotalUsers'), value: totalUsers, icon: Users, tone: 'primary' },
    { label: t('platformAnalytics.statTotalBranches'), value: totalBranches, icon: Network, tone: 'primary' },
  ];

  return (
    <ModulePage
      title={t('platformAnalytics.title')}
      subtitle={t('platformAnalytics.description')}
      actions={<RangeSelector value={range} />}
    >

      {/* Cross-links to deeper screens */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/platform/companies"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:border-primary/40"
        >
          <Building2 className="h-4 w-4" /> {t('platformAnalytics.openCompanies')}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </Link>
        <Link
          href="/platform/billing"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:border-primary/40"
        >
          <CreditCard className="h-4 w-4" /> {t('platformAnalytics.openBilling')}
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </Link>
      </div>

      {/* T1 — Headline KPIs */}
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('platformAnalytics.kpiTitle')}</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={k.value === null ? '—' : nf(k.value)}
            icon={k.icon}
            tone={k.tone}
          />
        ))}
      </div>

      {/* Information layer — growth + subscription mix */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> {t('platformAnalytics.growthTitle')}
            </CardTitle>
            <CardDescription>{t('platformAnalytics.growthSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {growthHasData ? (
              <GrowthChart points={growthPoints} unit={t('platformAnalytics.newCompanies')} />
            ) : (
              <EmptyState icon={<TrendingUp />} title={t('platformAnalytics.growthEmpty')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="h-4 w-4 text-primary" /> {t('platformAnalytics.mixTitle')}
            </CardTitle>
            <CardDescription>{t('platformAnalytics.mixSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {mixItems.length ? (
              <RankedBars items={mixItems} unit={t('platformAnalytics.companiesUnit')} />
            ) : (
              <EmptyState icon={<PieChart />} title={t('platformAnalytics.mixEmpty')} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue — per-currency only (never summed) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-primary" /> {t('platformAnalytics.revenueTitle')}
          </CardTitle>
          <CardDescription>{t('platformAnalytics.revenueSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {revenueUnavailable ? (
            <p className="text-sm text-muted-foreground">{t('platformAnalytics.sectionUnavailable')}</p>
          ) : revenueDerivable && revenueEntries.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {revenueEntries.map(([currency, minor]) => (
                <div key={currency} className="rounded-lg border border-border p-4">
                  <p className="text-xs text-muted-foreground">{currency}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums" dir="ltr">
                    {formatMoney(minor, currency)}
                    <span className="ms-1 text-xs font-normal text-muted-foreground">
                      {t('platformAnalytics.revenuePerMonth')}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          ) : paidCountEntries.length ? (
            <div>
              <p className="mb-3 text-sm text-warning">{t('platformAnalytics.revenueFallbackNote')}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {paidCountEntries.map(([currency, count]) => (
                  <div key={currency} className="rounded-lg border border-border p-4">
                    <p className="text-xs text-muted-foreground">{currency}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums" dir="ltr">
                      {nf(count)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t('platformAnalytics.revenuePaidSubs')}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon={<CreditCard />} title={t('platformAnalytics.revenueEmpty')} />
          )}
        </CardContent>
      </Card>

      {/* Details layer — module adoption + business-type distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" /> {t('platformAnalytics.modulesTitle')}
            </CardTitle>
            <CardDescription>{t('platformAnalytics.modulesSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {moduleItems.length ? (
              <RankedBars items={moduleItems} unit={t('platformAnalytics.companiesUnit')} />
            ) : (
              <EmptyState icon={<Boxes />} title={t('platformAnalytics.modulesEmpty')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="h-4 w-4 text-primary" /> {t('platformAnalytics.typesTitle')}
            </CardTitle>
            <CardDescription>{t('platformAnalytics.typesSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {typeItems.length ? (
              <RankedBars items={typeItems} unit={t('platformAnalytics.companiesUnit')} />
            ) : (
              <EmptyState icon={<Tags />} title={t('platformAnalytics.typesEmpty')} />
            )}
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
