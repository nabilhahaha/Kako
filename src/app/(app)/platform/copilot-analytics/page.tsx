import { redirect } from 'next/navigation';
import { BarChart3, MessageCircleQuestion, MonitorX, ShieldAlert, Activity, Percent } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  loadConfusionAnalytics,
  type ConfusionBucket,
} from '@/app/(app)/copilot/actions';
import { ACTION_REQUIREMENTS, BLOCK_REASONS, SCREENS, type BlockCode } from '@/lib/erp/copilot/copilot-kb';

// ─────────────────────────────────────────────────────────────────────────────
// F16 — Confusion Analytics (Platform Owner / Company Admin only). READ-ONLY.
//
// Renders the aggregated copilot query log: most-asked actions, most confusing
// screens, most common block reasons, blocked rate, and volume by type. RLS and
// the action both restrict the data to admins/owner. Raw keys are mapped to the
// KB's bilingual labels so nothing shows as a raw id. Mobile-first (stacks).
// ─────────────────────────────────────────────────────────────────────────────

export default async function CopilotAnalyticsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!ctx.isPlatformOwner && !isCompanyAdmin && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t, locale } = await getT();
  const res = await loadConfusionAnalytics();

  if (!res.ok || !res.data) {
    return (
      <div>
        <PageHeader title={t('copilot.analyticsTitle')} description={t('copilot.analyticsDescription')} />
        <EmptyState
          icon={<BarChart3 />}
          title={t('copilot.analyticsAdminOnly')}
        />
      </div>
    );
  }

  const data = res.data;

  // ── Label resolvers (KB-backed; never show a raw id) ──
  const pick = (b: { en: string; ar: string }) => (locale === 'ar' ? b.ar : b.en);

  const actionLabel = (key: string) =>
    ACTION_REQUIREMENTS[key] ? pick(ACTION_REQUIREMENTS[key].label) : key;

  const screenLabel = (href: string) => {
    const s = SCREENS.filter((x) => href.startsWith(x.match)).sort((a, b) => b.match.length - a.match.length)[0];
    return s ? pick(s.title) : href;
  };

  const reasonLabel = (code: string) =>
    BLOCK_REASONS[code as BlockCode] ? pick(BLOCK_REASONS[code as BlockCode].title) : code;

  const typeLabels: Record<string, string> = {
    screen_help: t('copilot.typeScreenHelp'),
    why_blocked: t('copilot.typeWhyBlocked'),
    next_best_action: t('copilot.typeNextBestAction'),
    training: t('copilot.typeTraining'),
    permission_explain: t('copilot.typePermissionExplain'),
    workflow_status: t('copilot.typeWorkflowStatus'),
    quick_help: t('copilot.typeQuickHelp'),
  };
  const typeLabel = (key: string) => typeLabels[key] ?? key;

  return (
    <div className="space-y-6">
      <PageHeader title={t('copilot.analyticsTitle')} description={t('copilot.analyticsDescription')} />

      {data.total === 0 ? (
        <EmptyState icon={<BarChart3 />} title={t('copilot.analyticsEmpty')} />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label={t('copilot.totalQueries')}
              value={String(data.total)}
              icon={Activity}
              tone="info"
            />
            <StatCard
              label={t('copilot.blockedRate')}
              value={`${Math.round(data.blockedRate * 100)}%`}
              icon={Percent}
              tone={data.blockedRate >= 0.4 ? 'destructive' : 'warning'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankedCard
              title={t('copilot.topActions')}
              icon={<MessageCircleQuestion className="h-5 w-5" />}
              items={data.topActions}
              label={actionLabel}
              countLabel={t('copilot.count')}
            />
            <RankedCard
              title={t('copilot.topScreens')}
              icon={<MonitorX className="h-5 w-5" />}
              items={data.topScreens}
              label={screenLabel}
              countLabel={t('copilot.count')}
            />
            <RankedCard
              title={t('copilot.topReasons')}
              icon={<ShieldAlert className="h-5 w-5" />}
              items={data.topReasons}
              label={reasonLabel}
              countLabel={t('copilot.count')}
            />
            <RankedCard
              title={t('copilot.byType')}
              icon={<BarChart3 className="h-5 w-5" />}
              items={data.byType}
              label={typeLabel}
              countLabel={t('copilot.count')}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** A simple horizontal-bar ranking from a tallied bucket list. */
function RankedCard({
  title,
  icon,
  items,
  label,
  countLabel,
}: {
  title: string;
  icon: React.ReactNode;
  items: ConfusionBucket[];
  label: (key: string) => string;
  countLabel: string;
}) {
  const max = items.reduce((m, it) => Math.max(m, it.count), 0) || 1;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <span className="text-muted-foreground">{icon}</span>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((it) => (
              <li key={it.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{label(it.key)}</span>
                  <span className="shrink-0 font-semibold tabular-nums" dir="ltr" aria-label={countLabel}>
                    {it.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (it.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
