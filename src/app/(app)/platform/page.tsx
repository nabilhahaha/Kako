import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { ModulePage } from '@/components/admin/module-page';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
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
  describeAuditEvent,
  AUDIT_DESTRUCTIVE_ACTIONS,
  type AuditEventLike,
} from '@/lib/erp/audit';
import {
  Building2,
  CheckCircle2,
  Clock,
  ChevronDown,
  Network,
  Settings2,
  Plug,
  AlertTriangle,
  CircleSlash,
  ShieldAlert,
  UserPlus,
  ScrollText,
  CreditCard,
  Zap,
  Sparkles,
  UserX,
  Inbox,
  Activity,
  RefreshCcw,
  Siren,
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

/** Read a count from a verified table; returns null (not 0) if the query fails,
 *  so the UI can omit the metric gracefully rather than show a misleading zero. */
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

/** Read rows from a verified table; returns null (signal omitted) on any error,
 *  so a missing backing table degrades the Attention Center gracefully. */
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

/** Compact relative-time formatter for server-rendered timestamps. */
function relativeTime(iso: string, locale: 'en' | 'ar'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(-day, 'day');
  const month = Math.round(day / 30);
  if (Math.abs(month) < 12) return rtf.format(-month, 'month');
  return rtf.format(-Math.round(month / 12), 'year');
}

export default async function PlatformOverviewPage() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <ModulePage title={t('platform.overview.title')}>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOnly')}
          </CardContent>
        </Card>
      </ModulePage>
    );
  }

  const supabase = await createClient();
  const [{ data: companies }, { data: branches }, { data: userBranches }, { data: companyModules }] =
    await Promise.all([
      supabase.from('erp_companies').select('*').order('created_at', { ascending: false }),
      supabase.from('erp_branches').select('id, company_id'),
      supabase.from('erp_user_branches').select('user_id, branch_id'),
      // erp_company_modules verified in migration 0036 (company_id, module, enabled)
      supabase.from('erp_company_modules').select('company_id, enabled'),
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

  // companies with at least one enabled module (for the "0 modules" alert)
  const enabledModuleCount = new Map<string, number>();
  for (const m of (companyModules as { company_id: string; enabled: boolean }[]) ?? []) {
    if (!m.enabled) continue;
    enabledModuleCount.set(m.company_id, (enabledModuleCount.get(m.company_id) ?? 0) + 1);
  }

  // portfolio tallies by subscription state
  const tally: Record<SubscriptionState, number> = {
    active: 0, expiring: 0, expired: 0, suspended: 0, trial: 0, open: 0,
  };
  for (const c of companyList) tally[subscriptionState(c)] += 1;

  const activeCompanies = tally.active + tally.open + tally.expiring + tally.trial;
  const trialCount = tally.trial;
  // "Paid" = companies whose subscription is on a paid footing (active / expiring / open).
  const paidCount = tally.active + tally.expiring + tally.open;

  const totalBranches = (branches as unknown[] | null)?.length ?? 0;
  const totalUsers = new Set(
    ((userBranches as { user_id: string }[]) ?? []).map((u) => u.user_id),
  ).size;

  // subscriptions expiring within 7 days (KPI uses the tighter ≤7d window)
  const expiringWeek = companyList.filter((c) => {
    if (subscriptionState(c) !== 'expiring') return false;
    const left = daysLeft(c);
    return left !== null && left >= 0 && left <= 7;
  }).length;

  // ── Integration health (verified tables; degrade gracefully if absent) ──────
  // erp_integrations (0093), erp_api_keys (0091), erp_sync_jobs / erp_sync_runs (0094).
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [
    activeConnections,
    activeApiKeys,
    activeSyncJobs,
    failedRuns,
    integrationCompanyRows,
  ] = await Promise.all([
    safeCount(() =>
      supabase
        .from('erp_integrations')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('revoked_at', null),
    ),
    safeCount(() =>
      supabase
        .from('erp_api_keys')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('revoked_at', null),
    ),
    safeCount(() =>
      supabase
        .from('erp_sync_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .is('revoked_at', null),
    ),
    safeCount(() =>
      supabase
        .from('erp_sync_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('started_at', sevenDaysAgo),
    ),
    (async () => {
      try {
        const { data, error } = await supabase
          .from('erp_integrations')
          .select('company_id')
          .is('revoked_at', null);
        if (error) return null;
        return new Set((data as { company_id: string }[]).map((r) => r.company_id)).size;
      } catch {
        return null;
      }
    })(),
  ]);

  const integrationMetrics = [
    { key: 'integrationActiveConnections', value: activeConnections },
    { key: 'integrationCompanies', value: integrationCompanyRows },
    { key: 'integrationApiKeys', value: activeApiKeys },
    { key: 'integrationSyncJobs', value: activeSyncJobs },
    { key: 'integrationFailedRuns', value: failedRuns, danger: true },
  ].filter((m) => m.value !== null) as { key: string; value: number; danger?: boolean }[];

  // ── Platform Attention Center (attention-first signals) ─────────────────────
  // Every signal is built from a VERIFIED table; a query that errors yields null
  // and the card is omitted (see report). Scans are capped/aggregated to stay cheap.
  const companyNameById = new Map<string, string>(
    companyList.map((c) => [c.id, c.name_ar || c.name]),
  );
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 86_400_000).toISOString();

  const [
    pendingTasks,           // erp_workflow_tasks (verified 0088): status='pending'
    failedSyncRuns,         // erp_sync_runs (verified 0094): status='failed', recent
    activityLogRows,        // erp_audit_logs (verified 0024): company_id + created_at
    anomalyRows,            // erp_audit_logs: destructive/permission actions in 24h
    recentAuditRows,        // erp_audit_logs: latest events for the activity card
  ] = await Promise.all([
    safeRows<{ company_id: string | null }>(() =>
      supabase
        .from('erp_workflow_tasks')
        .select('company_id')
        .eq('status', 'pending')
        .limit(500),
    ),
    safeRows<{ id: string; company_id: string | null; error: string | null; started_at: string }>(() =>
      supabase
        .from('erp_sync_runs')
        .select('id, company_id, error, started_at')
        .eq('status', 'failed')
        .gte('started_at', sevenDaysAgo)
        .order('started_at', { ascending: false })
        .limit(50),
    ),
    safeRows<{ company_id: string | null; created_at: string }>(() =>
      supabase
        .from('erp_audit_logs')
        .select('company_id, created_at')
        .not('company_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2000),
    ),
    safeRows<{ actor_email: string | null; action: string }>(() =>
      supabase
        .from('erp_audit_logs')
        .select('actor_email, action')
        .gte('created_at', twentyFourHoursAgo)
        .limit(1000),
    ),
    safeRows<AuditEventLike & { id: string; created_at: string }>(() =>
      supabase
        .from('erp_audit_logs')
        .select('id, actor_email, company_id, action, entity, entity_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(8),
    ),
  ]);

  type AttnSeverity = 'destructive' | 'warning' | 'info';
  type AttnCard = {
    key: string;
    severity: AttnSeverity;
    icon: typeof Clock;
    title: string;
    count: number;
    href: string;
    items: string[];
  };
  const attention: AttnCard[] = [];

  // 1) Expiring subscriptions (≤7d) — reuse already-computed subscription state.
  {
    const expiring = companyList
      .map((c) => ({ c, left: daysLeft(c), state: subscriptionState(c) }))
      .filter((r) => r.state === 'expiring' && r.left !== null && r.left >= 0 && r.left <= 7)
      .sort((a, b) => (a.left ?? 0) - (b.left ?? 0));
    if (expiring.length > 0) {
      attention.push({
        key: 'expiring',
        severity: 'warning',
        icon: Clock,
        title: t('platform.overview.attnExpiring'),
        count: expiring.length,
        href: '/platform/companies?status=expiring',
        items: expiring.slice(0, 3).map((r) =>
          `${r.c.name_ar || r.c.name} · ${t('platform.overview.daysLeft', { n: r.left as number })}`,
        ),
      });
    }
  }

  // 2) Pending approval requests — erp_workflow_tasks (verified).
  if (pendingTasks !== null && pendingTasks.length > 0) {
    const byCompany = new Map<string, number>();
    for (const row of pendingTasks) {
      const id = row.company_id ?? '—';
      byCompany.set(id, (byCompany.get(id) ?? 0) + 1);
    }
    const top = [...byCompany.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    attention.push({
      key: 'pending',
      severity: 'info',
      icon: Inbox,
      title: t('platform.overview.attnPending'),
      count: pendingTasks.length,
      href: '/platform/companies',
      items: top.map(([cid, n]) =>
        `${cid === '—' ? '—' : companyNameById.get(cid) ?? cid} · ${formatNumber(n)}`,
      ),
    });
  }

  // 3) Companies with no active users — erp_companies × erp_user_branches.
  {
    const noUsers = companyList.filter((c) => (usersByCompany.get(c.id)?.size ?? 0) === 0);
    if (noUsers.length > 0) {
      attention.push({
        key: 'noUsers',
        severity: 'info',
        icon: UserX,
        title: t('platform.overview.attnNoUsers'),
        count: noUsers.length,
        href: '/platform/companies',
        items: noUsers.slice(0, 3).map((c) => c.name_ar || c.name),
      });
    }
  }

  // 4) Companies with no activity in 30 days — latest erp_audit_logs per company.
  if (activityLogRows !== null) {
    const lastActivity = new Map<string, string>();
    for (const r of activityLogRows) {
      if (!r.company_id) continue;
      // rows arrive newest-first, so first seen is the latest
      if (!lastActivity.has(r.company_id)) lastActivity.set(r.company_id, r.created_at);
    }
    const stale = companyList.filter((c) => {
      const last = lastActivity.get(c.id);
      return !last || last < thirtyDaysAgo;
    });
    if (stale.length > 0) {
      attention.push({
        key: 'noActivity',
        severity: 'warning',
        icon: Activity,
        title: t('platform.overview.attnNoActivity'),
        count: stale.length,
        href: '/platform/audit',
        items: stale.slice(0, 3).map((c) => {
          const last = lastActivity.get(c.id);
          const when = last ? relativeTime(last, locale) : t('platform.overview.attnNever');
          return `${c.name_ar || c.name} · ${when}`;
        }),
      });
    }
  }

  // 5) Failed sync runs (7d) — erp_sync_runs (verified). Connection vs job failure
  //    is not separable from this table alone, so present one combined signal.
  if (failedSyncRuns !== null && failedSyncRuns.length > 0) {
    attention.push({
      key: 'failedSync',
      severity: 'destructive',
      icon: RefreshCcw,
      title: t('platform.overview.attnFailedSync'),
      count: failedSyncRuns.length,
      href: '/platform/companies',
      items: failedSyncRuns.slice(0, 3).map((r) => {
        const name = r.company_id ? companyNameById.get(r.company_id) ?? '—' : '—';
        const err = (r.error ?? '').slice(0, 40);
        return err ? `${name} · ${err}` : name;
      }),
    });
  }

  // 6) Audit anomalies (heuristic) — destructive/permission actions in last 24h.
  if (anomalyRows !== null) {
    const destructive = anomalyRows.filter((r) => AUDIT_DESTRUCTIVE_ACTIONS.has(r.action));
    const ANOMALY_THRESHOLD = 10;
    if (destructive.length >= ANOMALY_THRESHOLD) {
      const byActor = new Map<string, number>();
      for (const r of destructive) {
        const a = r.actor_email ?? '—';
        byActor.set(a, (byActor.get(a) ?? 0) + 1);
      }
      const top = [...byActor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      attention.push({
        key: 'anomaly',
        severity: 'warning',
        icon: Siren,
        title: t('platform.overview.attnAnomaly'),
        count: destructive.length,
        href: '/platform/audit',
        items: top.map(([actor, n]) => `${actor} · ${formatNumber(n)}`),
      });
    }
  }

  // Order by urgency: destructive → warning → info.
  const SEV_ORDER: Record<AttnSeverity, number> = { destructive: 0, warning: 1, info: 2 };
  attention.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.count - a.count);

  // Recent audit activity (human-friendly sentences) for the overview card.
  const recentAudit = (recentAuditRows ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    sentence: describeAuditEvent(r, {
      locale,
      companyName: r.company_id ? companyNameById.get(r.company_id) ?? null : null,
    }),
    destructive: AUDIT_DESTRUCTIVE_ACTIONS.has(r.action),
  }));

  // ── System alerts (derived, prioritized) ────────────────────────────────────
  type Alert = {
    id: string;
    label: string;
    company: string;
    href: string;
    severity: 'destructive' | 'warning';
  };
  const alerts: Alert[] = [];
  for (const c of companyList) {
    const name = c.name_ar || c.name;
    const base = `/platform/companies/${c.id}`;
    // Deep-link to the Company 360 section most relevant to the alert.
    const subHref = `${base}?tab=subscription#section-subscription`;
    const modHref = `${base}?tab=modules#section-modules`;
    const state = subscriptionState(c);
    if (state === 'expired') {
      alerts.push({ id: `exp-${c.id}`, label: t('platform.overview.alertExpired'), company: name, href: subHref, severity: 'destructive' });
    } else if (state === 'suspended') {
      alerts.push({ id: `sus-${c.id}`, label: t('platform.overview.alertSuspended'), company: name, href: subHref, severity: 'destructive' });
    } else if (state === 'expiring') {
      const left = daysLeft(c);
      if (left !== null && left <= 7) {
        alerts.push({ id: `exg-${c.id}`, label: t('platform.overview.alertExpiring'), company: name, href: subHref, severity: 'warning' });
      }
    }
    // 0 enabled modules (only flag active/paid companies — not suspended/expired noise)
    if ((state === 'active' || state === 'trial' || state === 'open') && (enabledModuleCount.get(c.id) ?? 0) === 0) {
      alerts.push({ id: `mod-${c.id}`, label: t('platform.overview.alertNoModules'), company: name, href: modHref, severity: 'warning' });
    }
  }
  // destructive first, capped for the cockpit view
  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'destructive' ? -1 : 1));
  const topAlerts = alerts.slice(0, 8);

  const expiringSoon = companyList
    .map((c) => ({ company: c, left: daysLeft(c), state: subscriptionState(c) }))
    .filter((r) => r.state === 'expiring' || r.state === 'expired')
    .sort((a, b) => (a.left ?? 0) - (b.left ?? 0))
    .slice(0, 6);

  const recent = companyList.slice(0, 5);

  const quickActions = [
    { href: '/platform/companies', icon: Building2, label: t('platform.overview.qaNewCompany') },
    { href: '/platform/staff', icon: UserPlus, label: t('platform.overview.qaInviteStaff') },
    { href: '/platform/audit', icon: ScrollText, label: t('platform.overview.qaViewAudit') },
    { href: '/platform/billing', icon: CreditCard, label: t('platform.overview.qaBilling') },
  ];

  return (
    <ModulePage
      title={t('platform.overview.title')}
      subtitle={t('platform.overview.description')}
      actions={
        <Link href="/platform/companies">
          <Button variant="secondary">
            <Settings2 className="h-4 w-4" />
            {t('platform.overview.manageCompanies')}
          </Button>
        </Link>
      }
    >

      {/* ── T1: Attention summary (above the fold) ─────────────────────────
          Top ~3 items needing attention, severity-ordered, each labelled
          urgent/blocked/review with a 1-tap drill-down. Answers
          "what's urgent / blocked / to do" in ~5s on mobile. */}
      <section className="mb-4">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <Siren className="h-4 w-4 text-warning" /> {t('platform.overview.attnSummaryTitle')}
        </h2>
        {/* Portfolio health line (one calm line of context). */}
        <p className="mb-3 text-sm text-muted-foreground" dir="auto">
          {t('platform.overview.portfolioLine', {
            companies: formatNumber(companyList.length),
            expiring: formatNumber(expiringWeek),
            blocked: formatNumber(tally.expired + tally.suspended),
          })}
        </p>
        {attention.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title={t('platform.overview.attnAllClear')}
            description={t('platform.overview.attnAllClearHint')}
          />
        ) : (
          <ul className="space-y-2">
            {attention.slice(0, 3).map((card) => {
              const tone =
                card.severity === 'destructive'
                  ? 'border-destructive/40 bg-destructive/5'
                  : card.severity === 'warning'
                    ? 'border-warning/40 bg-warning/5'
                    : 'border-info/40 bg-info/5';
              const iconTone =
                card.severity === 'destructive'
                  ? 'text-destructive'
                  : card.severity === 'warning'
                    ? 'text-warning'
                    : 'text-info';
              const sevLabel =
                card.severity === 'destructive'
                  ? t('platform.overview.attnSummaryBlocked')
                  : card.severity === 'warning'
                    ? t('platform.overview.attnSummaryUrgent')
                    : t('platform.overview.attnSummaryReview');
              const badgeVariant =
                card.severity === 'destructive' ? 'destructive' : card.severity === 'warning' ? 'warning' : 'info';
              return (
                <li key={card.key}>
                  <Link
                    href={card.href}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/40 ${tone}`}
                  >
                    <card.icon className={`h-5 w-5 shrink-0 ${iconTone}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Badge variant={badgeVariant}>{sevLabel}</Badge>
                        <span className="truncate text-sm font-semibold">{card.title}</span>
                        <span className={`ms-auto text-lg font-bold tabular-nums ${iconTone}`} dir="ltr">
                          {formatNumber(card.count)}
                        </span>
                      </span>
                      {card.items[0] && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {card.items[0]}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
            {attention.length > 3 && (
              <li>
                <Link
                  href="/platform/companies"
                  className="block px-1 text-xs font-medium text-primary hover:underline"
                >
                  {t('platform.overview.attnDrillDown')}
                </Link>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* ── Quick actions (compact, kept above the fold) ───────────────────── */}
      <Card className="mb-6">
        <CardContent className="p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickActions.map((qa) => (
              <Link key={qa.href} href={qa.href}>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <qa.icon className="h-4 w-4" />
                  {qa.label}
                </Button>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── T2/T3: full detail, demoted behind a single expander ───────────
          Calm default; everything is one tap away. No capability removed —
          KPI strip, Integration Health, System alerts, Recent Activity and the
          Expiring/Recent lists all live here. */}
      <details className="group mb-6 rounded-lg border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 font-medium">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            {t('platform.overview.moreDetails')}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t p-4">

      {/* KPI strip — reflows 1→2→4 across breakpoints (Active Users KPI removed) */}
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">{t('platform.overview.kpiStripTitle')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('platform.overview.statActive')}
          value={formatNumber(activeCompanies)}
          icon={CheckCircle2}
          tone="success"
          href="/platform/companies"
        />
        <StatCard
          label={t('platform.overview.statTrialVsPaid')}
          value={`${formatNumber(trialCount)} / ${formatNumber(paidCount)}`}
          icon={Sparkles}
          tone="info"
          href="/platform/companies"
        />
        <StatCard
          label={t('platform.overview.statExpiringWeek')}
          value={formatNumber(expiringWeek)}
          icon={Clock}
          tone={expiringWeek > 0 ? 'warning' : 'primary'}
          href="/platform/companies"
        />
        <StatCard
          label={t('platform.overview.statTotalBranches')}
          value={formatNumber(totalBranches)}
          icon={Network}
        />
      </div>

      {/* Integration health + System alerts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <Plug className="h-4 w-4" /> {t('platform.overview.integrationTitle')}
              </h2>
            </div>
            {integrationMetrics.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t('platform.overview.integrationNone')}
              </p>
            ) : (
              <ul className="divide-y">
                {integrationMetrics.map((m) => (
                  <li key={m.key} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {m.danger
                        ? <AlertTriangle className={m.value > 0 ? 'h-4 w-4 text-destructive' : 'h-4 w-4'} />
                        : <Zap className="h-4 w-4" />}
                      {t(`platform.overview.${m.key}`)}
                    </span>
                    <span
                      className={`font-bold tabular-nums ${m.danger && m.value > 0 ? 'text-destructive' : ''}`}
                      dir="ltr"
                    >
                      {formatNumber(m.value)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4" /> {t('platform.overview.alertsTitle')}
              </h2>
              {topAlerts.length > 0 && (
                <Badge variant="destructive">{formatNumber(alerts.length)}</Badge>
              )}
            </div>
            {topAlerts.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<CheckCircle2 />}
                  title={t('platform.overview.alertsAllClear')}
                  description={t('platform.overview.alertsAllClearHint')}
                  className="border-0 py-8"
                />
              </div>
            ) : (
              <ul className="divide-y">
                {topAlerts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-secondary/40"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {a.severity === 'destructive'
                          ? <CircleSlash className="h-4 w-4 shrink-0 text-destructive" />
                          : <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />}
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{a.company}</span>
                          <span className="block text-xs text-muted-foreground">{a.label}</span>
                        </span>
                      </span>
                      <Badge variant={a.severity === 'destructive' ? 'destructive' : 'warning'}>
                        {a.label}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent audit activity — human-friendly sentences */}
      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="flex items-center gap-2 font-semibold">
              <ScrollText className="h-4 w-4" /> {t('platform.overview.recentAuditTitle')}
            </h2>
            <Link href="/platform/audit" className="text-xs text-primary hover:underline">
              {t('platform.overview.viewAll')}
            </Link>
          </div>
          {recentAudit.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<ScrollText />}
                title={t('platform.overview.recentAuditEmpty')}
                className="border-0 py-8"
              />
            </div>
          ) : (
            <ul className="divide-y">
              {recentAudit.map((e) => (
                <li key={e.id}>
                  <Link
                    href="/platform/audit"
                    className="flex items-start justify-between gap-3 p-3 text-sm hover:bg-secondary/40"
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      {e.destructive
                        ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        : <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 break-words">{e.sentence}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                      {relativeTime(e.created_at, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Expiring soon + Recent companies */}
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
              <div className="p-4">
                <EmptyState title={t('platform.overview.noExpiring')} className="border-0 py-8" />
              </div>
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
              <div className="p-4">
                <EmptyState
                  icon={<Building2 />}
                  title={t('platform.overview.noCompanies')}
                  action={
                    <Link href="/platform/companies">
                      <Button size="sm">{t('platform.overview.qaNewCompany')}</Button>
                    </Link>
                  }
                  className="border-0 py-8"
                />
              </div>
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
                          {c.business_type ? (BUSINESS_TYPE_LABELS[c.business_type]?.[locale] ?? c.business_type) : '—'}
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
      </details>
    </ModulePage>
  );
}
