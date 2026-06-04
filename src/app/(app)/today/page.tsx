import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Play, Receipt, Users, ListChecks, MapPin, Boxes, AlertTriangle } from 'lucide-react';
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

const COVERAGE_TONE: Record<'good' | 'attention' | 'critical' | 'unknown', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive', unknown: 'info' };

export default async function TodayHomePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isField =
    ctx.isPlatformOwner || ctx.isSuperAdmin ||
    hasPermission(ctx, 'field.sales') ||
    ctx.memberships.some((m) => m.role === 'salesman' || m.role === 'admin' || m.role === 'manager' || m.role === 'supervisor');
  if (!isField) redirect('/dashboard');

  const { t, locale } = await getT();
  const [sigRes, itemsRes] = await Promise.all([homeSignals(), nextBestActions(locale)]);
  const sig = sigRes.ok && sigRes.data ? sigRes.data : EMPTY_HOME_SIGNALS;
  const items = rankAttention(itemsRes.ok && itemsRes.data ? itemsRes.data : []);
  const summary = summarizeAttention(items);

  const quick: QuickLink[] = [
    { label: t('nav.items.invoices'), href: '/sales/invoices', icon: Receipt },
    { label: t('nav.items.customers'), href: '/customers', icon: Users },
    { label: t('nav.items.attentionCenter'), href: '/attention', icon: ListChecks },
    { label: t('nav.bottom.inventory'), href: '/inventory', icon: Boxes },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('home.todayTitle')} description={t('home.todaySubtitle')} />

      {/* Single primary action: start / continue the journey. */}
      <Link
        href="/field/journey"
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Play className="h-5 w-5 rtl:rotate-180" />
        {t('home.startJourney')}
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('home.coverage')} value={sig.coveragePct == null ? '—' : `${Math.round(sig.coveragePct)}%`} icon={MapPin} tone={COVERAGE_TONE[coverageBand(sig.coveragePct)]} />
        <StatCard label={t('home.overdue')} value={String(sig.overdue)} icon={AlertTriangle} tone={sig.overdue > 0 ? 'destructive' : 'success'} href="/sales/invoices" />
        <StatCard label={t('home.items')} value={String(summary.itemCount)} icon={ListChecks} tone="info" href="/attention" />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.attentionFirst')}</h2>
        <AttentionList items={items.slice(0, 8)} openLabel={t('home.open')} emptyTitle={t('home.emptyAttention')} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.quickActions')}</h2>
        <QuickNav links={quick} />
      </section>
    </div>
  );
}
