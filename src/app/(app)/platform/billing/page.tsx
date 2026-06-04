import { redirect } from 'next/navigation';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { DEFAULT_PAGE_SIZE, param, pageNumber, rangeFor, type SearchParams } from '@/lib/list-params';
import {
  BillingAdmin, type PlanRow, type PriceRow, type SubRow, type InvoiceRow, type AttentionSummary,
} from './billing-admin';

const SUB_STATUSES = ['trial', 'active', 'suspended', 'cancelled', 'expired'];
const INV_STATUSES = ['draft', 'issued', 'paid', 'void'];
/** Invoice statuses that count as money owed (not yet paid, not voided). */
const UNPAID_STATUSES = ['draft', 'issued'];
const INV_DATES = ['30', '90', 'year'];

/** YYYY-MM-DD for "today" / "today + N days" used by attention windows. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
/** ISO timestamp N days ago (for invoice date filter on issued_at timestamptz). */
function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function yearStartIso(): string {
  return `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
}

/** ── Billing administration (Platform Owner only) ──────────────────────────
 *  Top-down: T1 attention summary → primary action (New subscription) →
 *  T2 subscriptions + invoices (server-paginated, searchable) →
 *  T3/T4 price book (base price by default; full matrix behind Advanced).
 *  Core Platform capability; writes go through the unchanged owner-gated RPCs. */
export default async function PlatformBillingPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { t } = await getT();
  const pctx = await getPlatformContext();
  if (!pctx) redirect('/login');

  if (!pctx.isOwner) {
    return (
      <div>
        <PageHeader title={t('billing.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('billing.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const sp = (await searchParams) ?? {};
  const pageSize = DEFAULT_PAGE_SIZE;

  // ── List controls (namespaced so subscriptions & invoices page independently) ─
  const subPage = pageNumber(sp, 'sub_page');
  const subQ = (param(sp, 'sub_q') ?? '').trim();
  const subStatusRaw = param(sp, 'sub_status');
  const subStatus = SUB_STATUSES.includes(subStatusRaw ?? '') ? subStatusRaw! : 'all';

  const invPage = pageNumber(sp, 'inv_page');
  const invQ = (param(sp, 'inv_q') ?? '').trim();
  const invStatusRaw = param(sp, 'inv_status');
  const invStatus = INV_STATUSES.includes(invStatusRaw ?? '') ? invStatusRaw! : 'all';
  const invDateRaw = param(sp, 'inv_date');
  const invDate = INV_DATES.includes(invDateRaw ?? '') ? invDateRaw! : 'all';

  // Resolve company ids matching a free-text search (name/name_ar) once per query;
  // subscriptions & invoices only hold company_id, so we filter by the id set.
  async function companyIdsMatching(q: string): Promise<string[]> {
    if (!q) return [];
    const like = `%${q}%`;
    const { data } = await supabase
      .from('erp_companies')
      .select('id')
      .or(`name.ilike.${like},name_ar.ilike.${like}`)
      .limit(500);
    return ((data as { id: string }[]) ?? []).map((c) => c.id);
  }
  const [subMatchIds, invMatchIds] = await Promise.all([
    companyIdsMatching(subQ),
    companyIdsMatching(invQ),
  ]);

  // ── Reference data (plans, prices, all companies for the picker) ──────────
  const today = todayIso();
  const soon7 = addDaysIso(7);

  const [
    { data: plans },
    { data: prices },
    { data: companies },
  ] = await Promise.all([
    supabase.from('erp_plans').select('key, name_en, name_ar, trial_days, is_active').order('rank', { ascending: false }),
    supabase.from('erp_billing_plan_prices').select('plan_key, currency, interval, amount_minor, is_active'),
    supabase.from('erp_companies').select('id, name, name_ar').order('created_at', { ascending: true }),
  ]);

  const companyName = new Map(
    ((companies as { id: string; name: string; name_ar: string | null }[]) ?? []).map((c) => [c.id, c.name_ar || c.name]),
  );

  // ── T1 attention aggregates (head-only counts across ALL rows) ────────────
  const [
    unpaidAgg,
    expiringAgg,
    expiredAgg,
    trialsAgg,
    unpaidSums,
  ] = await Promise.all([
    supabase.from('erp_billing_invoices').select('id', { count: 'exact', head: true }).in('status', UNPAID_STATUSES),
    supabase.from('erp_billing_subscriptions').select('id', { count: 'exact', head: true })
      .in('status', ['active', 'trial']).gte('current_period_end', today).lte('current_period_end', soon7),
    supabase.from('erp_billing_subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'expired'),
    supabase.from('erp_billing_subscriptions').select('id', { count: 'exact', head: true })
      .eq('status', 'trial').gte('trial_end', today).lte('trial_end', soon7),
    // Sum of unpaid totals is approximate (multi-currency): we report the count
    // and a per-currency breakdown string from the unpaid rows (capped).
    supabase.from('erp_billing_invoices').select('currency, total_minor').in('status', UNPAID_STATUSES).limit(1000),
  ]);

  const unpaidByCurrency: Record<string, number> = {};
  for (const r of (unpaidSums.data as { currency: string; total_minor: number }[]) ?? []) {
    unpaidByCurrency[r.currency] = (unpaidByCurrency[r.currency] ?? 0) + Number(r.total_minor ?? 0);
  }

  const attention: AttentionSummary = {
    unpaidCount: unpaidAgg.count ?? 0,
    unpaidByCurrency,
    expiringCount: expiringAgg.count ?? 0,
    expiredCount: expiredAgg.count ?? 0,
    trialsCount: trialsAgg.count ?? 0,
  };

  // ── T2 subscriptions (server-paginated) ───────────────────────────────────
  let subQuery = supabase
    .from('erp_billing_subscriptions')
    .select('company_id, plan_key, currency, interval, status, trial_end, current_period_end', { count: 'exact' });
  if (subStatus !== 'all') subQuery = subQuery.eq('status', subStatus);
  if (subQ) subQuery = subQuery.in('company_id', subMatchIds.length ? subMatchIds : ['00000000-0000-0000-0000-000000000000']);
  subQuery = subQuery.order('current_period_end', { ascending: true, nullsFirst: false });
  const [subFrom, subTo] = rangeFor(subPage, pageSize);
  const { data: subs, count: subCount } = await subQuery.range(subFrom, subTo);

  const subRows: SubRow[] = ((subs as Record<string, unknown>[]) ?? []).map((s) => ({
    companyId: s.company_id as string,
    company: companyName.get(s.company_id as string) ?? (s.company_id as string),
    planKey: s.plan_key as string,
    currency: s.currency as string,
    interval: s.interval as string,
    status: s.status as string,
    trialEnd: (s.trial_end as string) ?? null,
    periodEnd: (s.current_period_end as string) ?? null,
  }));

  // ── T2 invoices (server-paginated) ────────────────────────────────────────
  let invQuery = supabase
    .from('erp_billing_invoices')
    .select('id, company_id, number, currency, total_minor, tax_minor, status, issued_at', { count: 'exact' });
  if (invStatus !== 'all') invQuery = invQuery.eq('status', invStatus);
  if (invQ) invQuery = invQuery.in('company_id', invMatchIds.length ? invMatchIds : ['00000000-0000-0000-0000-000000000000']);
  if (invDate === '30') invQuery = invQuery.gte('issued_at', daysAgoIso(30));
  else if (invDate === '90') invQuery = invQuery.gte('issued_at', daysAgoIso(90));
  else if (invDate === 'year') invQuery = invQuery.gte('issued_at', yearStartIso());
  invQuery = invQuery.order('issued_at', { ascending: false });
  const [invFrom, invTo] = rangeFor(invPage, pageSize);
  const { data: invoices, count: invCount } = await invQuery.range(invFrom, invTo);

  const invoiceRows: InvoiceRow[] = ((invoices as Record<string, unknown>[]) ?? []).map((i) => ({
    id: i.id as string,
    company: companyName.get(i.company_id as string) ?? (i.company_id as string),
    number: i.number as string,
    currency: i.currency as string,
    totalMinor: Number(i.total_minor ?? 0),
    taxMinor: Number(i.tax_minor ?? 0),
    status: i.status as string,
    issuedAt: i.issued_at as string,
  }));

  return (
    <div>
      <PageHeader title={t('billing.title')} description={t('billing.subtitle')} />
      <BillingAdmin
        plans={(plans as PlanRow[]) ?? []}
        prices={(prices as PriceRow[]) ?? []}
        companies={((companies as { id: string; name: string; name_ar: string | null }[]) ?? []).map((c) => ({
          id: c.id, name: c.name_ar || c.name,
        }))}
        attention={attention}
        subscriptions={subRows}
        subTotal={subCount ?? subRows.length}
        subPage={subPage}
        subFilters={{ q: subQ, status: subStatus }}
        invoices={invoiceRows}
        invTotal={invCount ?? invoiceRows.length}
        invPage={invPage}
        invFilters={{ q: invQ, status: invStatus, date: invDate }}
        pageSize={pageSize}
      />
    </div>
  );
}
