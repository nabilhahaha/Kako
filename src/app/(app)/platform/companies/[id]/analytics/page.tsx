import { redirect, notFound } from 'next/navigation';
import {
  TrendingUp,
  Wallet,
  Users as UsersIcon,
  Percent,
  CreditCard,
  Trophy,
  Boxes,
  Route,
  UserPlus,
} from 'lucide-react';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import { decimalsFor } from '@/lib/erp/billing';
import type { Company } from '@/lib/erp/types';
import { GrowthChart, RankedBars, type SeriesPoint, type RankedItem } from '../../../analytics/analytics-charts';
import { RangeSelector, GROWTH_RANGES, type GrowthRange } from '../../../analytics/range-selector';
import type { SearchParams } from '@/lib/list-params';
import { param } from '@/lib/list-params';

// ─────────────────────────────────────────────────────────────────────────────
// Per-company Analytics Dashboard (Platform Owner only) — READ-ONLY.
//
// The platform owner views ONE company's operational analytics (sales, AR,
// collections, top customers/products, route coverage, new-vs-returning). Owner
// reads everything via RLS. Every query is SCOPED to this company through its
// branch ids (erp_branches.company_id → branch ids); the leaf tables key off
// branch_id / invoice_id, never a company_id (which they do not have).
//
// Volumes for one company are bounded, so we fetch capped row sets (≤ 8k) and
// aggregate in JS — NO SQL group-by, NO RPC, NO view, NO schema change. Each
// query degrades gracefully (safeRows → null → the section shows an empty/
// unavailable note). All money is shown in the company's OWN currency and is
// never summed across currencies (a single company has exactly one currency).
// Layout: Attention (KPIs) → Information (trends) → Details (rankings/coverage).
// ─────────────────────────────────────────────────────────────────────────────

const ROW_CAP = 8000;

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

/** Issued/realised invoice statuses (draft + cancelled are excluded from sales). */
const COUNTED_STATUSES = new Set(['issued', 'paid', 'partially_paid', 'overdue']);

type InvoiceRow = {
  id: string;
  customer_id: string;
  status: string;
  net_amount: number | string | null;
  created_at: string;
};
type LineRow = { invoice_id: string; product_id: string; quantity: number | string | null; line_total: number | string | null };
type PaymentRow = { invoice_id: string; amount: number | string | null; payment_date: string | null; created_at: string };
type CustomerRow = { id: string; name: string; name_ar: string | null; balance: number | string | null; created_at: string };
type ProductRow = { id: string; name: string; name_ar: string | null };
type VisitRow = { customer_id: string; invoice_id: string | null; no_sale: boolean; visit_date: string };

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? (n as number) : 0;
};

export default async function CompanyAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const { t, locale } = await getT();
  const pctx = await getPlatformContext();
  if (!pctx) redirect('/login');

  if (!pctx.isOwner) {
    return (
      <div>
        <PageHeader title={t('companyAnalytics.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('companyAnalytics.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: companyRow } = await supabase
    .from('erp_companies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!companyRow) notFound();
  const company = companyRow as Company;
  const companyName = company.name_ar || company.name;
  const currency = company.currency || 'EGP';

  const sp = (await searchParams) ?? {};
  const rangeRaw = param(sp, 'range');
  const range: GrowthRange = GROWTH_RANGES.includes(rangeRaw as GrowthRange) ? (rangeRaw as GrowthRange) : '90';
  const rangeDays = Number(range);
  const windowStart = new Date(Date.now() - rangeDays * 86_400_000);
  const windowStartIso = windowStart.toISOString();

  // i18n-aware formatters.
  const nf = (v: number) => formatNumber(v, locale === 'ar' ? 'ar-EG' : 'en');
  const decimals = decimalsFor(currency);
  const money = (major: number) =>
    `${new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(major)} ${currency}`;

  // ── Scope: resolve this company's branch ids (erp_branches.company_id) ──────
  const branchRows = await safeRows<{ id: string }>(() =>
    supabase.from('erp_branches').select('id').eq('company_id', id),
  );
  const branchIds = (branchRows ?? []).map((b) => b.id);

  // No branches → no operational data is possible; show a clean empty page.
  if (branchIds.length === 0) {
    return (
      <div>
        <BackLink href={`/platform/companies/${id}`} label={t('companyAnalytics.backToCompany')} />
        <PageHeader title={companyName} description={t('companyAnalytics.title')} />
        <EmptyState icon={<TrendingUp />} title={t('companyAnalytics.noBranches')} />
      </div>
    );
  }

  // ── Bounded reads, all scoped to the company's branches / their invoices ────
  // Customers belong to a branch (erp_customers.branch_id); invoices/visits key
  // off branch_id; lines/payments key off invoice_id. Capped + aggregated in JS.
  const [customers, invoices, visits] = await Promise.all([
    safeRows<CustomerRow>(() =>
      supabase
        .from('erp_customers')
        .select('id, name, name_ar, balance, created_at')
        .in('branch_id', branchIds)
        .limit(ROW_CAP),
    ),
    safeRows<InvoiceRow>(() =>
      supabase
        .from('erp_invoices')
        .select('id, customer_id, status, net_amount, created_at')
        .in('branch_id', branchIds)
        .gte('created_at', windowStartIso)
        .order('created_at', { ascending: false })
        .limit(ROW_CAP),
    ),
    safeRows<VisitRow>(() =>
      supabase
        .from('erp_visits')
        .select('customer_id, invoice_id, no_sale, visit_date')
        .in('branch_id', branchIds)
        .gte('visit_date', windowStart.toISOString().slice(0, 10))
        .limit(ROW_CAP),
    ),
  ]);

  // Counted (issued/realised) invoices within the window, used for all sales.
  const countedInvoices = (invoices ?? []).filter((i) => COUNTED_STATUSES.has(i.status));
  const invoiceIds = countedInvoices.map((i) => i.id);

  // Lines + payments depend on the in-window invoice ids (bounded by them).
  const [lines, payments] = await Promise.all([
    invoiceIds.length
      ? safeRows<LineRow>(() =>
          supabase
            .from('erp_invoice_lines')
            .select('invoice_id, product_id, quantity, line_total')
            .in('invoice_id', invoiceIds)
            .limit(ROW_CAP),
        )
      : Promise.resolve([] as LineRow[]),
    invoiceIds.length
      ? safeRows<PaymentRow>(() =>
          supabase
            .from('erp_payments')
            .select('invoice_id, amount, payment_date, created_at')
            .in('invoice_id', invoiceIds)
            .limit(ROW_CAP),
        )
      : Promise.resolve([] as PaymentRow[]),
  ]);

  // ── T1 KPIs ────────────────────────────────────────────────────────────────
  const monthStartIso = startOfMonth(new Date()).toISOString();
  // Sales this month (net) — sum of counted invoices created this calendar month.
  const salesThisMonth = countedInvoices
    .filter((i) => i.created_at >= monthStartIso)
    .reduce((s, i) => s + num(i.net_amount), 0);

  // AR outstanding — sum of customer balances (outstanding receivable).
  const arOutstanding = customers === null ? null : customers.reduce((s, c) => s + num(c.balance), 0);

  // Active customers — distinct customers with ≥1 counted invoice in the window.
  const activeCustomerIds = new Set(countedInvoices.map((i) => i.customer_id));
  const activeCustomers = invoices === null ? null : activeCustomerIds.size;

  // Collection rate — payments received ÷ amount issued (counted invoices) in window.
  const issuedTotal = countedInvoices.reduce((s, i) => s + num(i.net_amount), 0);
  const collectedTotal = (payments ?? []).reduce((s, p) => s + num(p.amount), 0);
  const collectionRate =
    payments === null || invoices === null
      ? null
      : issuedTotal > 0
        ? Math.min(999, Math.round((collectedTotal / issuedTotal) * 100))
        : null;

  const kpis: { label: string; value: string; hint?: string; icon: typeof Wallet; tone: StatTone }[] = [
    {
      label: t('companyAnalytics.kpiSalesMonth'),
      value: invoices === null ? '—' : money(salesThisMonth),
      icon: TrendingUp,
      tone: 'primary',
    },
    {
      label: t('companyAnalytics.kpiArOutstanding'),
      value: arOutstanding === null ? '—' : money(arOutstanding),
      icon: Wallet,
      tone: arOutstanding != null && arOutstanding > 0 ? 'warning' : 'success',
    },
    {
      label: t('companyAnalytics.kpiActiveCustomers'),
      value: activeCustomers === null ? '—' : nf(activeCustomers),
      hint: t('companyAnalytics.kpiActiveCustomersHint'),
      icon: UsersIcon,
      tone: 'info',
    },
    {
      label: t('companyAnalytics.kpiCollectionRate'),
      value: collectionRate === null ? '—' : `${nf(collectionRate)}%`,
      icon: Percent,
      tone: collectionRate == null ? 'info' : collectionRate >= 80 ? 'success' : collectionRate >= 50 ? 'warning' : 'destructive',
    },
  ];

  // ── Sales over last 6 months (monthly bucketing, same as 5.4) ───────────────
  // We always render 6 months regardless of the window selector (the selector
  // governs the windowed sections); fetch the 6-month sales slice separately
  // capped, so the trend is stable.
  const base = startOfMonth(new Date());
  const sixEdges: { start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const end = new Date(base.getFullYear(), base.getMonth() - i + 1, 1);
    sixEdges.push({ start, end });
  }
  const sixStartIso = sixEdges[0].start.toISOString();

  const sixMonthInvoices = await safeRows<{ status: string; net_amount: number | string | null; created_at: string }>(() =>
    supabase
      .from('erp_invoices')
      .select('status, net_amount, created_at')
      .in('branch_id', branchIds)
      .gte('created_at', sixStartIso)
      .limit(ROW_CAP),
  );
  const sixCounted = (sixMonthInvoices ?? []).filter((i) => COUNTED_STATUSES.has(i.status));

  const monthFmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', { month: 'short' });
  const salesPoints: SeriesPoint[] = sixEdges.map((m) => {
    const s = m.start.toISOString();
    const e = m.end.toISOString();
    const total = sixCounted
      .filter((i) => i.created_at >= s && i.created_at < e)
      .reduce((sum, i) => sum + num(i.net_amount), 0);
    return { label: monthFmt.format(m.start), value: Math.round(total) };
  });
  const salesHasData = sixMonthInvoices !== null && salesPoints.some((p) => p.value > 0);

  // ── Collections over time (6 months, payment_date bucketed) ─────────────────
  // Payments key off invoice_id; fetch payments for 6-month invoice ids.
  const sixInvoiceIdsRows = await safeRows<{ id: string }>(() =>
    supabase
      .from('erp_invoices')
      .select('id')
      .in('branch_id', branchIds)
      .gte('created_at', sixStartIso)
      .limit(ROW_CAP),
  );
  const sixInvoiceIds = (sixInvoiceIdsRows ?? []).map((r) => r.id);
  const sixPayments = sixInvoiceIds.length
    ? await safeRows<PaymentRow>(() =>
        supabase
          .from('erp_payments')
          .select('invoice_id, amount, payment_date, created_at')
          .in('invoice_id', sixInvoiceIds)
          .limit(ROW_CAP),
      )
    : [];
  const collectionsPoints: SeriesPoint[] = sixEdges.map((m) => {
    const s = m.start.toISOString().slice(0, 10);
    const e = m.end.toISOString().slice(0, 10);
    const total = (sixPayments ?? [])
      .filter((p) => {
        const d = (p.payment_date ?? p.created_at).slice(0, 10);
        return d >= s && d < e;
      })
      .reduce((sum, p) => sum + num(p.amount), 0);
    return { label: monthFmt.format(m.start), value: Math.round(total) };
  });
  const collectionsHasData = sixPayments !== null && collectionsPoints.some((p) => p.value > 0);

  // ── Top customers by net sales within window (tally counted invoices) ───────
  const custName = new Map((customers ?? []).map((c) => [c.id, c.name_ar || c.name]));
  const salesByCustomer: Record<string, number> = {};
  for (const i of countedInvoices) salesByCustomer[i.customer_id] = (salesByCustomer[i.customer_id] ?? 0) + num(i.net_amount);
  const topCustomers: RankedItem[] = Object.entries(salesByCustomer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cid, v]) => ({ label: custName.get(cid) ?? cid.slice(0, 8), value: Math.round(v) }));

  // ── Top products by revenue (line_total) within window ──────────────────────
  const revByProduct: Record<string, number> = {};
  for (const l of lines ?? []) revByProduct[l.product_id] = (revByProduct[l.product_id] ?? 0) + num(l.line_total);
  const topProductIds = Object.entries(revByProduct)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([pid]) => pid);
  const productNames =
    topProductIds.length > 0
      ? await safeRows<ProductRow>(() =>
          supabase.from('erp_products_catalog').select('id, name, name_ar').in('id', topProductIds),
        )
      : [];
  const prodName = new Map((productNames ?? []).map((p) => [p.id, p.name_ar || p.name]));
  const topProducts: RankedItem[] = topProductIds.map((pid) => ({
    label: prodName.get(pid) ?? pid.slice(0, 8),
    value: Math.round(revByProduct[pid]),
  }));

  // ── Route coverage (FMCG visit KPIs) ────────────────────────────────────────
  // productive call = visit linked to an invoice (sale made); strike rate =
  // productive ÷ total visits; visited customers = distinct customers visited.
  const totalVisits = visits === null ? null : visits.length;
  const productiveVisits = (visits ?? []).filter((v) => v.invoice_id != null && !v.no_sale).length;
  const visitedCustomers = new Set((visits ?? []).map((v) => v.customer_id)).size;
  const strikeRate = totalVisits && totalVisits > 0 ? Math.round((productiveVisits / totalVisits) * 100) : 0;
  const coverageHasData = visits !== null && (visits?.length ?? 0) > 0;

  // ── New vs returning customers (created in window vs existing & active) ──────
  // New = customer created within the window. Returning = active in window
  // (≥1 counted invoice) but created before the window.
  const newCustomerIds = new Set(
    (customers ?? []).filter((c) => c.created_at >= windowStartIso).map((c) => c.id),
  );
  const newActive = [...activeCustomerIds].filter((cid) => newCustomerIds.has(cid)).length;
  const returningActive = [...activeCustomerIds].filter((cid) => !newCustomerIds.has(cid)).length;
  const newReturningItems: RankedItem[] = [
    { label: t('companyAnalytics.newCustomers'), value: newActive, barClassName: 'h-full rounded-full bg-info' },
    { label: t('companyAnalytics.returningCustomers'), value: returningActive, barClassName: 'h-full rounded-full bg-success' },
  ];
  const newReturningHasData = invoices !== null && newActive + returningActive > 0;

  return (
    <div>
      <BackLink href={`/platform/companies/${id}`} label={t('companyAnalytics.backToCompany')} />
      <PageHeader
        title={`${companyName} · ${t('companyAnalytics.title')}`}
        description={t('companyAnalytics.currencyNote', { currency })}
        action={<RangeSelector value={range} />}
      />

      {/* T1 — Headline KPIs */}
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('companyAnalytics.kpiTitle')}</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label}>
            <StatCard label={k.label} value={k.value} icon={k.icon} tone={k.tone} />
            {k.hint && <p className="mt-1 px-1 text-xs text-muted-foreground">{k.hint}</p>}
          </div>
        ))}
      </div>

      {/* Information — sales & collections trends */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" /> {t('companyAnalytics.salesTitle')}
            </CardTitle>
            <CardDescription>{t('companyAnalytics.salesSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {salesHasData ? (
              <GrowthChart points={salesPoints} unit={`${currency} ${t('companyAnalytics.salesUnit')}`} />
            ) : (
              <EmptyState icon={<TrendingUp />} title={t('companyAnalytics.salesEmpty')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-primary" /> {t('companyAnalytics.collectionsTitle')}
            </CardTitle>
            <CardDescription>{t('companyAnalytics.collectionsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {collectionsHasData ? (
              <GrowthChart points={collectionsPoints} unit={`${currency} ${t('companyAnalytics.collectionsUnit')}`} />
            ) : (
              <EmptyState icon={<CreditCard />} title={t('companyAnalytics.collectionsEmpty')} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details — top customers & products */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-primary" /> {t('companyAnalytics.topCustomersTitle')}
            </CardTitle>
            <CardDescription>{t('companyAnalytics.topCustomersSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {topCustomers.length ? (
              <RankedBars items={topCustomers} unit={currency} />
            ) : (
              <EmptyState icon={<Trophy />} title={t('companyAnalytics.topCustomersEmpty')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" /> {t('companyAnalytics.topProductsTitle')}
            </CardTitle>
            <CardDescription>{t('companyAnalytics.topProductsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length ? (
              <RankedBars items={topProducts} unit={currency} />
            ) : (
              <EmptyState icon={<Boxes />} title={t('companyAnalytics.topProductsEmpty')} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details — route coverage & new vs returning */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Route className="h-4 w-4 text-primary" /> {t('companyAnalytics.coverageTitle')}
            </CardTitle>
            <CardDescription>{t('companyAnalytics.coverageSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {coverageHasData ? (
              <div className="grid grid-cols-2 gap-3">
                <CoverageStat label={t('companyAnalytics.coverageVisits')} value={nf(totalVisits ?? 0)} />
                <CoverageStat label={t('companyAnalytics.coverageProductive')} value={nf(productiveVisits)} />
                <CoverageStat label={t('companyAnalytics.coverageStrikeRate')} value={`${nf(strikeRate)}%`} />
                <CoverageStat label={t('companyAnalytics.coverageVisitedCustomers')} value={nf(visitedCustomers)} />
              </div>
            ) : (
              <EmptyState icon={<Route />} title={t('companyAnalytics.coverageEmpty')} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" /> {t('companyAnalytics.newReturningTitle')}
            </CardTitle>
            <CardDescription>{t('companyAnalytics.newReturningSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            {newReturningHasData ? (
              <RankedBars items={newReturningItems} unit={t('companyAnalytics.customersUnit')} />
            ) : (
              <EmptyState icon={<UserPlus />} title={t('companyAnalytics.newReturningEmpty')} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Small read-only stat tile for the route-coverage grid. */
function CoverageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums" dir="ltr">{value}</p>
    </div>
  );
}
