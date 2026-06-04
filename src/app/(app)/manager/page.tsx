import { redirect } from 'next/navigation';
import { BarChart3, ClipboardCheck, ListChecks, Users, Receipt, Target, HeartPulse, AlertTriangle, TrendingDown } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { AttentionList, QuickNav, type QuickLink } from '@/components/home/home-widgets';
import { nextBestActions } from '@/app/(app)/copilot/actions';
import { homeSignals } from '@/app/(app)/home-actions';
import { EMPTY_HOME_SIGNALS } from '@/lib/erp/home-signals-types';
import { rankAttention, summarizeAttention } from '@/lib/erp/attention';
import { KpiScorecard } from '@/components/home/kpi-scorecard';
import { scoreStatus } from '@/lib/erp/scorecard';

const HEALTH_TONE: Record<'good' | 'attention' | 'critical', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive' };

export default async function ManagerHomePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isManager = ctx.isPlatformOwner || ctx.isSuperAdmin || hasPermission(ctx, 'reports.view') || ctx.memberships.some((m) => m.role === 'admin' || m.role === 'manager');
  if (!isManager) redirect('/dashboard');

  const { t, locale } = await getT();
  const [sigRes, itemsRes] = await Promise.all([homeSignals(), nextBestActions(locale)]);
  const sig = sigRes.ok && sigRes.data ? sigRes.data : EMPTY_HOME_SIGNALS;
  const items = rankAttention(itemsRes.ok && itemsRes.data ? itemsRes.data : []);
  const summary = summarizeAttention(items);

  const quick: QuickLink[] = [
    { label: t('nav.items.reportsCenter'), href: '/reports', icon: BarChart3 },
    { label: t('nav.items.approvalCenter'), href: '/approval-center', icon: ClipboardCheck },
    { label: t('nav.items.attentionCenter'), href: '/attention', icon: ListChecks },
    { label: t('nav.items.customers'), href: '/customers', icon: Users },
    { label: t('nav.items.invoices'), href: '/sales/invoices', icon: Receipt },
    { label: t('nav.items.targetsAchievement'), href: '/distribution/targets-achievement', icon: Target },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('home.managerTitle')} description={t('home.managerSubtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('home.health')} value={`${summary.healthScore}%`} icon={HeartPulse} tone={HEALTH_TONE[summary.healthBand]} />
        <StatCard label={t('home.urgent')} value={String(summary.danger)} icon={AlertTriangle} tone={summary.danger > 0 ? 'destructive' : 'success'} />
        <StatCard label={t('home.salesMtd')} value={formatCurrency(sig.salesMtd)} icon={BarChart3} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('home.overdue')} value={String(sig.overdue)} icon={Receipt} tone={sig.overdue > 0 ? 'destructive' : 'success'} href="/sales/invoices" />
        <StatCard label={t('home.lostCustomers')} value={String(sig.lostCustomers)} icon={TrendingDown} tone={sig.lostCustomers > 0 ? 'warning' : 'success'} href="/customers" />
        <StatCard label={t('home.items')} value={String(summary.itemCount)} icon={ListChecks} tone="info" href="/attention" />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.scorecards')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiScorecard
            label={t('home.scoreCoverage')}
            value={sig.coveragePct == null ? '—' : `${Math.round(sig.coveragePct)}%`}
            achievement={sig.coveragePct == null ? undefined : Math.round(sig.coveragePct)}
            status={sig.coveragePct == null ? undefined : scoreStatus(Math.round(sig.coveragePct))}
          />
          <KpiScorecard
            label={t('home.health')}
            value={`${summary.healthScore}%`}
            achievement={summary.healthScore}
            status={scoreStatus(summary.healthScore)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.attentionFirst')}</h2>
        <AttentionList items={items.slice(0, 8)} openLabel={t('home.open')} emptyTitle={t('home.emptyAttention')} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.quickNav')}</h2>
        <QuickNav links={quick} />
      </section>
    </div>
  );
}
