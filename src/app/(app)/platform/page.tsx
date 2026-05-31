import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import type { Company } from '@/lib/erp/types';
import {
  BUSINESS_TYPE_LABELS,
  daysLeft,
  subscriptionState,
  type SubscriptionState,
} from '@/lib/erp/subscription';
import {
  Building2,
  CheckCircle2,
  Clock,
  CircleSlash,
  Network,
  Users,
  Settings2,
} from 'lucide-react';
import { getT } from '@/lib/i18n/server';

type StateBadge = { variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' };

const STATE_BADGE_VARIANT: Record<SubscriptionState, StateBadge> = {
  active:    { variant: 'success' },
  expiring:  { variant: 'warning' },
  expired:   { variant: 'destructive' },
  suspended: { variant: 'destructive' },
  open:      { variant: 'info' },
};

export default async function PlatformOverviewPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <div>
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
  const [{ data: companies }, { data: branches }, { data: userBranches }] = await Promise.all([
    supabase.from('erp_companies').select('*').order('created_at', { ascending: false }),
    supabase.from('erp_branches').select('id, company_id'),
    supabase.from('erp_user_branches').select('user_id, branch_id'),
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
    active: 0,
    expiring: 0,
    expired: 0,
    suspended: 0,
    open: 0,
  };
  for (const c of companyList) tally[subscriptionState(c)] += 1;

  const totalBranches = (branches as unknown[] | null)?.length ?? 0;
  const totalUsers = new Set(
    ((userBranches as { user_id: string }[]) ?? []).map((u) => u.user_id),
  ).size;

  const expiringSoon = companyList
    .map((c) => ({ company: c, left: daysLeft(c), state: subscriptionState(c) }))
    .filter((r) => r.state === 'expiring' || r.state === 'expired')
    .sort((a, b) => (a.left ?? 0) - (b.left ?? 0));

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t('platform.overview.statTotalCompanies')} value={formatNumber(companyList.length)} icon={Building2} />
        <StatCard label={t('platform.overview.statActive')} value={formatNumber(tally.active + tally.open)} icon={CheckCircle2} tone="success" />
        <StatCard label={t('platform.overview.statExpiring')} value={formatNumber(tally.expiring)} icon={Clock} tone="warning" />
        <StatCard label={t('platform.overview.statExpiredSuspended')} value={formatNumber(tally.expired + tally.suspended)} icon={CircleSlash} tone="destructive" />
        <StatCard label={t('platform.overview.statTotalBranches')} value={formatNumber(totalBranches)} icon={Network} />
        <StatCard label={t('platform.overview.statTotalUsers')} value={formatNumber(totalUsers)} icon={Users} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4" /> {t('platform.overview.subscriptionsTitle')}
              </h2>
              <Link href="/platform/companies" className="text-xs text-primary hover:underline">{t('platform.overview.viewAll')}</Link>
            </div>
            {expiringSoon.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t('platform.overview.noExpiring')}
              </p>
            ) : (
              <ul className="divide-y">
                {expiringSoon.map(({ company, left, state }) => {
                  const badge = STATE_BADGE_VARIANT[state];
                  const stateLabel = t(`platform.state.${state}`);
                  return (
                    <li key={company.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <Link href={`/platform/companies/${company.id}`} className="min-w-0 hover:underline">
                        <p className="truncate font-medium">{company.name_ar || company.name}</p>
                        {company.subscription_end && (
                          <span className="text-xs text-muted-foreground" dir="ltr">{company.subscription_end}</span>
                        )}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        {left !== null && (
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {left < 0
                              ? t('platform.overview.daysAgo', { n: Math.abs(left) })
                              : t('platform.overview.daysLeft', { n: left })}
                          </span>
                        )}
                        <Badge variant={badge.variant}>{stateLabel}</Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Building2 className="h-4 w-4" /> {t('platform.overview.recentTitle')}
              </h2>
              <Link href="/platform/companies" className="text-xs text-primary hover:underline">{t('platform.overview.viewAll')}</Link>
            </div>
            {recent.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t('platform.overview.noCompanies')}
              </p>
            ) : (
              <ul className="divide-y">
                {recent.map((c) => {
                  const state = subscriptionState(c);
                  const badge = STATE_BADGE_VARIANT[state];
                  const stateLabel = t(`platform.state.${state}`);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <Link href={`/platform/companies/${c.id}`} className="min-w-0 hover:underline">
                        <p className="truncate font-medium">{c.name_ar || c.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {c.business_type ? BUSINESS_TYPE_LABELS[c.business_type][locale] : '—'}
                          {' · '}
                          {formatNumber(branchCount.get(c.id) ?? 0)} {t('platform.overview.branchCount')}
                          {' · '}
                          {formatNumber(usersByCompany.get(c.id)?.size ?? 0)} {t('platform.overview.userCount')}
                        </span>
                      </Link>
                      <Badge variant={badge.variant}>{stateLabel}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
