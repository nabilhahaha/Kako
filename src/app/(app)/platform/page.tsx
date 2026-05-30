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

const STATE_BADGE: Record<SubscriptionState, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'info' }> = {
  active: { label: 'نشط', variant: 'success' },
  expiring: { label: 'قارب الانتهاء', variant: 'warning' },
  expired: { label: 'منتهٍ', variant: 'destructive' },
  suspended: { label: 'موقوف', variant: 'destructive' },
  open: { label: 'مفتوح', variant: 'info' },
};

export default async function PlatformOverviewPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <div>
        <PageHeader title="لوحة المزوّد" />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            هذه الصفحة متاحة لمالك المنصّة فقط.
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
        title="لوحة المزوّد"
        description="نظرة عامة على الشركات المستأجرة وحالة اشتراكاتها"
        action={
          <Link href="/platform/companies">
            <Button variant="secondary">
              <Settings2 className="h-4 w-4" />
              إدارة الشركات
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="إجمالي الشركات" value={formatNumber(companyList.length)} icon={Building2} />
        <StatCard label="نشطة" value={formatNumber(tally.active + tally.open)} icon={CheckCircle2} tone="success" />
        <StatCard label="قاربت الانتهاء" value={formatNumber(tally.expiring)} icon={Clock} tone="warning" />
        <StatCard label="منتهية / موقوفة" value={formatNumber(tally.expired + tally.suspended)} icon={CircleSlash} tone="destructive" />
        <StatCard label="إجمالي الفروع" value={formatNumber(totalBranches)} icon={Network} />
        <StatCard label="إجمالي المستخدمين" value={formatNumber(totalUsers)} icon={Users} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4" /> اشتراكات تحتاج متابعة
              </h2>
              <Link href="/platform/companies" className="text-xs text-primary hover:underline">عرض الكل</Link>
            </div>
            {expiringSoon.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                لا توجد اشتراكات قاربت على الانتهاء.
              </p>
            ) : (
              <ul className="divide-y">
                {expiringSoon.map(({ company, left, state }) => {
                  const badge = STATE_BADGE[state];
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
                            {left < 0 ? `منذ ${Math.abs(left)} يوم` : `${left} يوم`}
                          </span>
                        )}
                        <Badge variant={badge.variant}>{badge.label}</Badge>
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
                <Building2 className="h-4 w-4" /> أحدث الشركات
              </h2>
              <Link href="/platform/companies" className="text-xs text-primary hover:underline">عرض الكل</Link>
            </div>
            {recent.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                لا توجد شركات بعد. أنشئ أول شركة من صفحة الإدارة.
              </p>
            ) : (
              <ul className="divide-y">
                {recent.map((c) => {
                  const badge = STATE_BADGE[subscriptionState(c)];
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <Link href={`/platform/companies/${c.id}`} className="min-w-0 hover:underline">
                        <p className="truncate font-medium">{c.name_ar || c.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {c.business_type ? BUSINESS_TYPE_LABELS[c.business_type] : '—'}
                          {' · '}
                          {formatNumber(branchCount.get(c.id) ?? 0)} فرع
                          {' · '}
                          {formatNumber(usersByCompany.get(c.id)?.size ?? 0)} مستخدم
                        </span>
                      </Link>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
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
