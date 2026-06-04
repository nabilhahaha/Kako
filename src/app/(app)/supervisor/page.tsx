import { redirect } from 'next/navigation';
import { ListChecks, ClipboardCheck, MapPin, Undo2, Users, Truck, HeartPulse, AlertTriangle } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { AttentionList, QuickNav, type QuickLink } from '@/components/home/home-widgets';
import { nextBestActions } from '@/app/(app)/copilot/actions';
import { homeSignals } from '@/app/(app)/home-actions';
import { EMPTY_HOME_SIGNALS } from '@/lib/erp/home-signals-types';
import { rankAttention, summarizeAttention, coverageBand } from '@/lib/erp/attention';

const HEALTH_TONE: Record<'good' | 'attention' | 'critical', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive' };
const COVERAGE_TONE: Record<'good' | 'attention' | 'critical' | 'unknown', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive', unknown: 'info' };

export default async function SupervisorHomePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isSupervisor =
    ctx.isPlatformOwner || ctx.isSuperAdmin ||
    ctx.memberships.some((m) => m.role === 'admin' || m.role === 'manager' || m.role === 'supervisor') ||
    hasPermission(ctx, 'visit.approve_out_of_route') || hasPermission(ctx, 'day.approve_close_exception');
  if (!isSupervisor) redirect('/dashboard');

  const { t, locale } = await getT();
  const [sigRes, itemsRes] = await Promise.all([homeSignals(), nextBestActions(locale)]);
  const sig = sigRes.ok && sigRes.data ? sigRes.data : EMPTY_HOME_SIGNALS;
  const items = rankAttention(itemsRes.ok && itemsRes.data ? itemsRes.data : []);
  const summary = summarizeAttention(items);
  const covBand = coverageBand(sig.coveragePct);

  const quick: QuickLink[] = [
    { label: t('nav.items.attentionCenter'), href: '/attention', icon: ListChecks },
    { label: t('nav.items.approvalCenter'), href: '/approval-center', icon: ClipboardCheck },
    { label: t('nav.items.journeyCompliance'), href: '/distribution/journey-compliance', icon: MapPin },
    { label: t('nav.items.returnsAnalysis'), href: '/distribution/returns-analysis', icon: Undo2 },
    { label: t('nav.items.customers'), href: '/customers', icon: Users },
    { label: t('nav.items.vanReconciliation'), href: '/field/van-reconciliation', icon: Truck },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('home.supervisorTitle')} description={t('home.supervisorSubtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('home.health')} value={`${summary.healthScore}%`} icon={HeartPulse} tone={HEALTH_TONE[summary.healthBand]} />
        <StatCard label={t('home.coverage')} value={sig.coveragePct == null ? '—' : `${Math.round(sig.coveragePct)}%`} icon={MapPin} tone={COVERAGE_TONE[covBand]} />
        <StatCard label={t('home.urgent')} value={String(summary.danger)} icon={AlertTriangle} tone={summary.danger > 0 ? 'destructive' : 'success'} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.needsYouNow')}</h2>
        <AttentionList items={items.slice(0, 8)} openLabel={t('home.open')} emptyTitle={t('home.emptyAttention')} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.quickNav')}</h2>
        <QuickNav links={quick} />
      </section>
    </div>
  );
}
