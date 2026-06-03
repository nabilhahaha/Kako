import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import type { Company } from '@/lib/erp/types';
import {
  BUSINESS_TYPE_LABELS,
  daysLeft,
  trialDaysLeft,
  onActiveTrial,
  subscriptionState,
  type SubscriptionState,
} from '@/lib/erp/subscription';
import { toMajor, formatMoney, type BillingInterval } from '@/lib/erp/billing';
import { getFxRates, convertToBase } from '@/lib/erp/fx-rates';
import {
  Building2,
  CheckCircle2,
  Clock,
  Network,
  Users,
  Settings2,
  FlaskConical,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Receipt,
  Layers,
} from 'lucide-react';
import { getT } from '@/lib/i18n/server';

type StateBadge = { variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' };

const STATE_BADGE_VARIANT: Record<SubscriptionState, StateBadge> = {
  active:    { variant: 'success' },
  expiring:  { variant: 'warning' },
  expired:   { variant: 'destructive' },
  suspended: { variant: 'destructive' },
  trial:     { variant: 'info' },
  open:      { variant: 'info' },
};

// Segmented-bar colors per subscription state (matches badge tones).
const STATE_BAR_CLS: Record<SubscriptionState, string> = {
  active:    'bg-success',
  open:      'bg-info',
  trial:     'bg-info/70',
  expiring:  'bg-warning',
  expired:   'bg-destructive',
  suspended: 'bg-destructive/70',
};

export default async function PlatformOverviewPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('platform.overview.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [
    { data: companies },
    { data: branches },
    { data: userBranches },
    { data: subs },
    { data: prices },
    { data: invoices },
    fx,
  ] = await Promise.all([
    supabase.from('erp_companies').select('*').order('created_at', { ascending: false }),
    supabase.from('erp_branches').select('id, company_id'),
    supabase.from('erp_user_branches').select('user_id, branch_id'),
    supabase.from('erp_billing_subscriptions').select('company_id, plan_key, currency, interval, status'),
    supabase.from('erp_billing_plan_prices').select('plan_key, currency, interval, amount_minor, is_active'),
    supabase.from('erp_billing_invoices').select('id, currency, total_minor, status'),
    getFxRates(),
  ]);

  const companyList = (companies as Company[]) ?? [];

  // branch + distinct-user counts per company
  const branchToCompany = new Map<string, string>();
  const branchCount = new Map<string, number>();
  for (const b of (branches as { id: string; company_id: string }[]) ?? []) {
    branchToCompany.set(b.id, b.company_id);
    branchCount.set(b.company_id, (branchCount.get(b.company_id) ?? 0) + 1);
  }
  const usersByCompany = new Map<string, Set<string>>();
  for (const ub of (userBranches as { user_id: string; branch_id: string }[]) ?? []) {
    const companyId = branchToCompany.get(ub.branch_id);
    if (!companyId) continue;
    let set = usersByCompany.get(companyId);
    if (!set) {
      set = new Set<string>();
      usersByCompany.set(companyId, set);
    }
    set.add(ub.user_id);
  }

  // portfolio tallies by subscription state
  const tally: Record<SubscriptionState, number> = {
    active: 0, expiring: 0, expired: 0, suspended: 0, trial: 0, open: 0,
  };
  for (const c of companyList) tally[subscriptionState(c)] += 1;

  const activeCompanies = tally.active + tally.open;
  const trialCompanies = tally.trial;
  const atRiskCompanies = tally.expiring + tally.expired + tally.suspended;

  const totalBranches = (branches as unknown[] | null)?.length ?? 0;
  const totalUsers = new Set(
    ((userBranches as { user_id: string }[]) ?? []).map((u) => u.user_id),
  ).size;

  // "Active users" = distinct users belonging to non-expired/non-suspended tenants.
  const activeUserSet = new Set<string>();
  for (const c of companyList) {
    const st = subscriptionState(c);
    if (st === 'expired' || st === 'suspended') continue;
    for (const u of usersByCompany.get(c.id) ?? []) activeUserSet.add(u);
  }
  const activeUsers = activeUserSet.size;

  // ── Revenue (MRR/ARR) ───────────────────────────────────────────────────
  // Normalize every active subscription's price to a monthly amount in its own
  // currency, then to the base currency for one executive number. The per-
  // currency breakdown keeps source amounts visible (never hidden).
  const priceMap = new Map<string, number>();
  for (const p of (prices as { plan_key: string; currency: string; interval: string; amount_minor: number; is_active: boolean }[]) ?? []) {
    priceMap.set(`${p.plan_key}|${p.currency}|${p.interval}`, p.amount_minor);
  }
  const subRows = (subs as { company_id: string; plan_key: string; currency: string; interval: string; status: string }[]) ?? [];
  const activeSubs = subRows.filter((s) => s.status === 'active');

  const monthlyMinorByCurrency = new Map<string, number>();
  let mrrBase = 0;
  let hasUnrated = false;
  for (const s of activeSubs) {
    const amount = priceMap.get(`${s.plan_key}|${s.currency}|${s.interval}`);
    if (amount == null) continue;
    const monthlyMinor = s.interval === ('yearly' as BillingInterval) ? Math.round(amount / 12) : amount;
    monthlyMinorByCurrency.set(s.currency, (monthlyMinorByCurrency.get(s.currency) ?? 0) + monthlyMinor);
  }
  const breakdown = [...monthlyMinorByCurrency.entries()]
    .map(([currency, monthlyMinor]) => {
      const base = convertToBase(toMajor(monthlyMinor, currency), currency, fx);
      if (base == null) hasUnrated = true;
      else mrrBase += base;
      return { currency, monthlyMinor, base };
    })
    .sort((a, b) => (b.base ?? 0) - (a.base ?? 0));
  const arrBase = mrrBase * 12;
  const fmtBase = (v: number) => `${formatNumber(Math.round(v))} ${fx.base}`;

  // ── Subscription status distribution (segmented bar) ────────────────────
  const stateOrder: SubscriptionState[] = ['active', 'open', 'trial', 'expiring', 'expired', 'suspended'];
  const distribution = stateOrder
    .map((st) => ({ st, n: tally[st] }))
    .filter((d) => d.n > 0);

  // ── Alerts & action queue ───────────────────────────────────────────────
  const trialsEnding = companyList.filter((c) => {
    if (!onActiveTrial(c)) return false;
    const left = trialDaysLeft(c);
    return left !== null && left <= 7;
  }).length;

  const expiringSoon = companyList
    .map((c) => ({ company: c, left: daysLeft(c), state: subscriptionState(c) }))
    .filter((r) => r.state === 'expiring' || r.state === 'expired')
    .sort((a, b) => (a.left ?? 0) - (b.left ?? 0));
  const renewals = expiringSoon.length;

  const invoiceRows = (invoices as { id: string; currency: string; total_minor: number; status: string }[]) ?? [];
  const unpaid = invoiceRows.filter((i) => i.status !== 'paid');
  let unpaidBase = 0;
  for (const i of unpaid) {
    const base = convertToBase(toMajor(Number(i.total_minor ?? 0), i.currency), i.currency, fx);
    if (base != null) unpaidBase += base;
  }
  const alertsTotal = trialsEnding + renewals + unpaid.length;

  const recent = companyList.slice(0, 5);

  return (
    <div>
      <PageHeader
        title={t('platform.overview.title')}
        description={t('platform.overview.description')}
        action={
          <Link href="/platform/companies">
            <Button variant="secondary">
              <Settings2 className="h-4 w-4" />
              {t('platform.overview.manageCompanies')}
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
      {/* Company health — headline portfolio numbers (clickable → companies) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('platform.overview.statTotalCompanies')} value={formatNumber(companyList.length)} icon={Building2} href="/platform/companies" />
        <StatCard label={t('platform.overview.statActive')} value={formatNumber(activeCompanies)} icon={CheckCircle2} tone="success" href="/platform/companies" />
        <StatCard label={t('platform.overview.statTrial')} value={formatNumber(trialCompanies)} icon={FlaskConical} tone="info" href="/platform/companies" />
        <StatCard label={t('platform.overview.statAtRisk')} value={formatNumber(atRiskCompanies)} icon={AlertTriangle} tone="warning" href="/platform/companies" />
      </div>

      {/* Revenue & scale */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('platform.overview.statMrr')} value={fmtBase(mrrBase)} icon={Wallet} tone="success" />
        <StatCard label={t('platform.overview.statArr')} value={fmtBase(arrBase)} icon={TrendingUp} tone="success" />
        <StatCard label={t('platform.overview.statActiveUsers')} value={formatNumber(activeUsers)} icon={Users} tone="info" />
        <StatCard label={t('platform.overview.statTotalBranches')} value={formatNumber(totalBranches)} icon={Network} />
      </div>

      {/* Revenue breakdown + subscription distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <SectionHeader
              icon={Wallet}
              title={t('platform.overview.revenueTitle')}
              hint={t('platform.overview.revenueAsOf', { date: fx.effectiveDate, base: fx.base })}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">{t('platform.overview.mrrNormalized')}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{fmtBase(mrrBase)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">{t('platform.overview.arrNormalized')}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{fmtBase(arrBase)}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t('platform.overview.breakdownTitle')}</p>
              {breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('platform.overview.noRevenue')}</p>
              ) : (
                <ul className="divide-y">
                  {breakdown.map(({ currency, monthlyMinor, base }) => (
                    <li key={currency} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="font-medium" dir="ltr">{formatMoney(monthlyMinor, currency)}</span>
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {base == null ? t('platform.overview.unrated') : `≈ ${fmtBase(base)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {t('platform.overview.indicativeNote')}
                {hasUnrated && ` ${t('platform.overview.unratedNote')}`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <SectionHeader icon={Layers} title={t('platform.overview.statusBreakdownTitle')} />
            {companyList.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('platform.overview.noCompanies')}</p>
            ) : (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
                  {distribution.map(({ st, n }) => (
                    <div key={st} className={STATE_BAR_CLS[st]} style={{ width: `${(n / companyList.length) * 100}%` }} />
                  ))}
                </div>
                <ul className="grid grid-cols-2 gap-2 text-sm">
                  {distribution.map(({ st, n }) => (
                    <li key={st} className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATE_BAR_CLS[st]}`} />
                      <span className="text-muted-foreground">{t(`platform.state.${st}`)}</span>
                      <span className="ms-auto font-medium tabular-nums" dir="ltr">{formatNumber(n)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action queue + recent companies */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <SectionHeader icon={AlertTriangle} title={t('platform.overview.actionQueueTitle')} />
            {alertsTotal === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('platform.overview.noAlerts')}</p>
            ) : (
              <ul className="space-y-2">
                <ActionRow icon={FlaskConical} href="/platform/companies" label={t('platform.overview.alertTrialsEnding')} count={trialsEnding} tone="info" />
                <ActionRow icon={Clock} href="/platform/companies" label={t('platform.overview.alertRenewals')} count={renewals} tone="warning" />
                <ActionRow icon={Receipt} href="/platform/billing" label={t('platform.overview.alertUnpaid')} count={unpaid.length} hint={unpaid.length > 0 ? fmtBase(unpaidBase) : undefined} tone="destructive" />
              </ul>
            )}
            {expiringSoon.length > 0 && (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t('platform.overview.subscriptionsTitle')}</p>
                <ul className="divide-y">
                  {expiringSoon.slice(0, 5).map(({ company, left, state }) => (
                    <li key={company.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link href={`/platform/companies/${company.id}`} className="min-w-0 hover:underline">
                        <span className="block truncate font-medium">{company.name_ar || company.name}</span>
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        {left !== null && (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {left < 0 ? t('platform.overview.daysAgo', { n: Math.abs(left) }) : t('platform.overview.daysLeft', { n: left })}
                          </span>
                        )}
                        <Badge variant={STATE_BADGE_VARIANT[state].variant}>{t(`platform.state.${state}`)}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <SectionHeader
              icon={Building2}
              title={t('platform.overview.recentTitle')}
              action={<Link href="/platform/companies" className="text-xs text-primary hover:underline">{t('platform.overview.viewAll')}</Link>}
            />
            {recent.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t('platform.overview.noCompanies')}</p>
            ) : (
              <ul className="divide-y">
                {recent.map((c) => {
                  const state = subscriptionState(c);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link href={`/platform/companies/${c.id}`} className="min-w-0 hover:underline">
                        <span className="block truncate font-medium">{c.name_ar || c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.business_type ? BUSINESS_TYPE_LABELS[c.business_type][locale] : '—'}
                          {' · '}
                          {formatNumber(branchCount.get(c.id) ?? 0)} {t('platform.overview.branchCount')}
                          {' · '}
                          {formatNumber(usersByCompany.get(c.id)?.size ?? 0)} {t('platform.overview.userCount')}
                        </span>
                      </Link>
                      <Badge variant={STATE_BADGE_VARIANT[state].variant}>{t(`platform.state.${state}`)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  href,
  label,
  count,
  hint,
  tone,
}: {
  icon: typeof Building2;
  href: string;
  label: string;
  count: number;
  hint?: string;
  tone: 'info' | 'warning' | 'destructive';
}) {
  const toneCls = tone === 'info' ? 'bg-info/10 text-info' : tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive';
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/30">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneCls}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm">{label}</span>
        {hint && <span className="text-xs text-muted-foreground" dir="ltr">{hint}</span>}
        <span className="text-lg font-bold tabular-nums" dir="ltr">{formatNumber(count)}</span>
      </Link>
    </li>
  );
}
