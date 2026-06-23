'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { BackLink } from '@/components/shared/back-link';
import { EmptyState } from '@/components/shared/empty-state';
import {
  CalendarPlus,
  Power,
  Users as UsersIcon,
  UserCheck,
  Boxes,
  Plug,
  Inbox,
  Clock,
  ScrollText,
  Activity,
  LineChart,
  Eye,
  SlidersHorizontal,
  Route,
  ClipboardCheck,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { Branch, Company } from '@/lib/erp/types';
import type { Plan, CompanyUsage } from '@/lib/erp/plans';
import { daysLeft, subscriptionState } from '@/lib/erp/subscription';
import { setCompanyActive, setSubscriptionEnd } from '../actions';
import { computeCompanyHealth, type HealthBand } from '@/lib/erp/company-health';
import {
  CompanyDetail,
  type MemberRow,
  type IntegrationRow,
  type ApiKeyRow,
} from './company-detail';
import { CompanyPermissions, type CompanyRoleRow } from './company-permissions';
import { CompanyAudit, type CompanyAuditRow } from './company-audit';
import { ModuleSettingsSection } from './module-settings-section';
import { RoutePlannerSection } from './route-planner-section';
import { FieldVerificationSection } from './field-verification-section';
import type { ResolvedSetting } from '@/lib/erp/module-settings-catalog';
import { tabToSection, SECTION_ORDER, type SectionKey } from './company-360-section';

/** URL-hash slug for each Company 360 section (mirrors the in-page section state
 *  so refresh + back/forward work). Kept separate from the SectionKey so the
 *  user-facing hashes read nicely (e.g. roles → #roles-permissions). */
const SECTION_HASH: Record<SectionKey, string> = {
  summary: 'summary',
  subscription: 'subscription',
  users: 'users',
  roles: 'roles-permissions',
  modules: 'modules',
  routePlanner: 'route-planner',
  fieldVerification: 'field-verification',
  workflow: 'module-settings',
  packs: 'packs',
  integrations: 'integrations',
  usage: 'usage',
  audit: 'audit',
};
function sectionFromHash(hash: string): SectionKey | null {
  const h = hash.replace(/^#/, '');
  return (Object.keys(SECTION_HASH) as SectionKey[]).find((k) => SECTION_HASH[k] === h) ?? null;
}

/** One curated company event for the Summary timeline (newest-first). */
export interface TimelineRow {
  id: string;
  created_at: string;
  /** Pre-rendered, locale-aware sentence from describeAuditEvent(). */
  sentence: string;
  destructive: boolean;
}

export interface Company360Props {
  company: Company;
  branches: Branch[];
  members: MemberRow[];
  companyRoles: { key: string; name_ar: string }[];
  plans: Plan[];
  usage: CompanyUsage;
  modulesByPlan: Record<string, string[]>;
  enabledModules: string[];
  integrations: IntegrationRow[];
  apiKeys: ApiKeyRow[];
  // Roles & Permissions section
  roles: CompanyRoleRow[];
  enabledRoles: string[];
  permsByRole: Record<string, string[]>;
  // Audit section
  auditRows: CompanyAuditRow[];
  // Module Configuration / Workflow Settings (read-only foundation)
  moduleSettings: ResolvedSetting[];
  // Route Planner module-health counts (read-only)
  routeCount: number | null;
  journeyPlanCount: number | null;
  rpDatasetCount: number | null;
  rpMissionCount: number | null;
  rpRequestCount: number | null;
  rpSourceCount: number | null;
  // Field Verification module-health counts (read-only)
  fvTotalCustomers: number | null;
  fvAssignedCustomers: number | null;
  fvVerifiedCustomers: number | null;
  fvPendingCustomers: number | null;
  fvOutsideRadiusAttempts: number | null;
  fvLastActivity: string | null;
  // Summary timeline
  timeline: TimelineRow[];
  // KPI / health backing data (read-only, degrade gracefully)
  activeUsers: number;
  totalUsers: number;
  modulesTotal: number;
  integrationConnections: number | null;
  failedSyncRuns: number | null;
  pendingApprovals: number | null;
  daysSinceLastActivity: number | null;
  /** Deep-link section to scroll to on mount (mapped from ?tab=). */
  initialSection?: string;
}

const BAND_BADGE: Record<HealthBand, 'success' | 'warning' | 'destructive'> = {
  healthy: 'success',
  at_risk: 'warning',
  critical: 'destructive',
};

const BAND_RING: Record<HealthBand, string> = {
  healthy: 'text-success',
  at_risk: 'text-warning',
  critical: 'text-destructive',
};

const STATE_BADGE_VARIANT = {
  active: 'success' as const,
  expiring: 'warning' as const,
  expired: 'destructive' as const,
  suspended: 'destructive' as const,
  trial: 'info' as const,
  open: 'info' as const,
};

function addMonths(base: Date, months: number): string {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

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

/** Circular health ring (pure SVG, no deps), tinted by band. */
function HealthRing({ score, band, size = 56 }: { score: number; band: HealthBand; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={BAND_RING[band]} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="opacity-15" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-foreground text-sm font-bold">
        {score}
      </text>
    </svg>
  );
}

export function Company360(props: Company360Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<SectionKey>(tabToSection(props.initialSection));

  // ── Section switching: one section visible at a time, state mirrored in the URL
  // hash (#summary … #module-settings). The hash is the single source of truth, so
  // refresh restores the section and browser back/forward switch it. Default is
  // Summary. We render ONLY the active section (no long scroll page).
  useEffect(() => {
    const apply = () => {
      const k = sectionFromHash(window.location.hash);
      if (k) setActive(k);
    };
    apply(); // honor an incoming hash on mount (refresh / shared link)
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  function goToSection(k: SectionKey) {
    setActive(k);
    // Assigning the hash adds a history entry and fires `hashchange` (which keeps
    // `active` in sync on back/forward). No element carries the bare id, so the
    // browser performs no scroll jump.
    if (typeof window !== 'undefined' && window.location.hash.replace(/^#/, '') !== SECTION_HASH[k]) {
      window.location.hash = SECTION_HASH[k];
    }
  }

  const { company } = props;
  const state = subscriptionState(company);
  const left = daysLeft(company);

  const health = computeCompanyHealth({
    subscriptionState: state,
    expiringWithin7Days: left != null && left >= 0 && left <= 7,
    activeUsers: props.activeUsers,
    totalUsers: props.totalUsers,
    integrationConnections: props.integrationConnections,
    failedSyncRuns: props.failedSyncRuns,
    pendingApprovals: props.pendingApprovals,
    daysSinceLastActivity: props.daysSinceLastActivity,
  });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('platform.company.toastError')); return; }
      toast.success(okMsg);
      router.refresh();
    });
  }

  function renewBy(months: number) {
    const anchor =
      company.subscription_end && new Date(company.subscription_end) > new Date()
        ? new Date(company.subscription_end)
        : new Date();
    run(() => setSubscriptionEnd(company.id, addMonths(anchor, months)), t('platform.company.subscription.toastRenewed'));
  }

  // KPI cards — each scrolls to its section anchor.
  const expiryTone: StatTone =
    left == null ? 'info' : left < 0 ? 'destructive' : left <= 7 ? 'warning' : left <= 14 ? 'warning' : 'success';
  const kpis: { label: string; value: string; icon: typeof UsersIcon; tone?: StatTone; section: SectionKey }[] = [
    { label: t('platform.company.c360.kpiUsers'), value: String(props.totalUsers), icon: UsersIcon, section: 'users' },
    { label: t('platform.company.c360.kpiActiveUsers'), value: String(props.activeUsers), icon: UserCheck, tone: 'success', section: 'users' },
    { label: t('platform.company.c360.kpiModules'), value: `${props.enabledModules.length} / ${props.modulesTotal}`, icon: Boxes, tone: 'info', section: 'modules' },
    {
      label: t('platform.company.c360.kpiIntegrations'),
      value: props.integrationConnections == null ? '—' : String(props.integrationConnections),
      icon: Plug,
      tone: (props.failedSyncRuns ?? 0) > 0 ? 'destructive' : 'primary',
      section: 'integrations',
    },
    {
      label: t('platform.company.c360.kpiApprovals'),
      value: props.pendingApprovals == null ? '—' : String(props.pendingApprovals),
      icon: Inbox,
      tone: (props.pendingApprovals ?? 0) > 0 ? 'warning' : 'primary',
      section: 'summary',
    },
    {
      label: t('platform.company.c360.kpiDaysToExpiry'),
      value: left == null ? '∞' : String(left),
      icon: Clock,
      tone: expiryTone,
      section: 'subscription',
    },
  ];

  const railLabels: Record<SectionKey, string> = {
    summary: t('platform.company.c360.railSummary'),
    subscription: t('platform.company.c360.railSubscription'),
    users: t('platform.company.c360.railUsers'),
    roles: t('platform.company.c360.railRoles'),
    modules: t('platform.company.c360.railModules'),
    routePlanner: t('platform.company.c360.railRoutePlanner'),
    fieldVerification: t('platform.company.c360.railFieldVerification'),
    workflow: t('platform.company.c360.railWorkflow'),
    packs: t('platform.company.c360.railPacks'),
    integrations: t('platform.company.c360.railIntegrations'),
    usage: t('platform.company.c360.railUsage'),
    audit: t('platform.company.c360.railAudit'),
  };

  // Shared CompanyDetail props (the section bodies reuse the existing components).
  const detailProps = {
    company: props.company,
    branches: props.branches,
    members: props.members,
    companyRoles: props.companyRoles,
    plans: props.plans,
    usage: props.usage,
    modulesByPlan: props.modulesByPlan,
    enabledModules: props.enabledModules,
  };

  /** Render ONLY the active section's body (no long scroll page). Each body reuses
   *  the same components as before — nothing is removed, just shown one at a time. */
  function renderSection(k: SectionKey) {
    switch (k) {
      case 'summary':
        return (
          <div className="space-y-6">
            <CompanyDetail tab="overview" {...detailProps} />
            <Card>
              <CardContent className="space-y-3 p-0">
                <div className="flex items-center justify-between border-b p-4">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Activity className="h-4 w-4" /> {t('platform.company.c360.timelineTitle')}
                  </h2>
                  <button type="button" onClick={() => goToSection('audit')} className="text-xs text-primary hover:underline">
                    {t('platform.company.c360.viewFullAudit')}
                  </button>
                </div>
                {props.timeline.length === 0 ? (
                  <div className="p-4">
                    <EmptyState icon={<ScrollText />} title={t('platform.company.c360.timelineEmpty')} className="border-0 py-8" />
                  </div>
                ) : (
                  <ul className="divide-y">
                    {props.timeline.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                        <span className="flex min-w-0 items-start gap-2">
                          <Activity className={`mt-0.5 h-4 w-4 shrink-0 ${e.destructive ? 'text-destructive' : 'text-muted-foreground'}`} />
                          <span className="min-w-0 break-words">{e.sentence}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                          {relativeTime(e.created_at, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        );
      case 'subscription':
        return (<><SectionHeader icon={Clock} title={t('platform.company.c360.railSubscription')} /><CompanyDetail tab="subscription" {...detailProps} /></>);
      case 'users':
        return (<><SectionHeader icon={UsersIcon} title={t('platform.company.c360.railUsers')} /><CompanyDetail tab="users" {...detailProps} /></>);
      case 'roles':
        return (
          <>
            <SectionHeader icon={UserCheck} title={t('platform.company.c360.railRoles')} />
            <CompanyPermissions companyId={company.id} roles={props.roles} enabledRoles={props.enabledRoles} permsByRole={props.permsByRole} view="permissions" />
          </>
        );
      case 'modules':
        return (<><SectionHeader icon={Boxes} title={t('platform.company.c360.railModules')} /><CompanyDetail tab="modules" {...detailProps} /></>);
      case 'routePlanner':
        return (
          <>
            <SectionHeader icon={Route} title={t('platform.company.c360.railRoutePlanner')} />
            <RoutePlannerSection
              enabled={props.enabledModules.includes('route_management')}
              planKey={company.plan_key ?? null}
              subState={state}
              daysLeft={left}
              routeCount={props.routeCount}
              journeyPlanCount={props.journeyPlanCount}
              rpDatasetCount={props.rpDatasetCount}
              rpMissionCount={props.rpMissionCount}
              rpRequestCount={props.rpRequestCount}
              rpSourceCount={props.rpSourceCount}
              settings={props.moduleSettings.filter((s) => s.def.module === 'route')}
            />
          </>
        );
      case 'fieldVerification':
        return (
          <>
            <SectionHeader icon={ClipboardCheck} title={t('platform.company.c360.railFieldVerification')} />
            <FieldVerificationSection
              enabled={props.enabledModules.includes('field_verification')}
              totalCustomers={props.fvTotalCustomers}
              assignedCustomers={props.fvAssignedCustomers}
              verifiedCustomers={props.fvVerifiedCustomers}
              pendingCustomers={props.fvPendingCustomers}
              outsideRadiusAttempts={props.fvOutsideRadiusAttempts}
              lastActivity={props.fvLastActivity}
            />
          </>
        );
      case 'workflow':
        return (
          <>
            <SectionHeader icon={SlidersHorizontal} title={t('platform.company.c360.railWorkflow')} />
            <ModuleSettingsSection settings={props.moduleSettings} enabledModules={props.enabledModules} />
          </>
        );
      case 'packs':
        return (<><SectionHeader icon={Boxes} title={t('platform.company.c360.railPacks')} /><CompanyDetail tab="packs" {...detailProps} /></>);
      case 'integrations':
        return (
          <>
            <SectionHeader icon={Plug} title={t('platform.company.c360.railIntegrations')} />
            <CompanyDetail tab="integrations" {...detailProps} integrations={props.integrations} apiKeys={props.apiKeys} />
          </>
        );
      case 'usage':
        return (<><SectionHeader icon={Activity} title={t('platform.company.c360.railUsage')} /><UsageSection plans={props.plans} company={company} usage={props.usage} /></>);
      case 'audit':
        return (
          <>
            <SectionHeader icon={ScrollText} title={t('platform.company.c360.railAudit')} />
            <CompanyAudit
              rows={props.auditRows}
              locale={locale}
              labels={{
                empty: t('platform.company.audit.empty'),
                time: t('platform.company.audit.time'),
                actor: t('platform.company.audit.actor'),
                action: t('platform.company.audit.action'),
                entity: t('platform.company.audit.entity'),
              }}
            />
          </>
        );
    }
  }

  return (
    <div>
      <BackLink href="/platform/companies" label={t('platform.company.c360.backToCompanies')} />

      {/* ── Sticky command header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Tooltip
            label={`${t('platform.company.c360.health')}: ${health.score} · ${t(`platform.company.health.band.${health.band}`)}`}
          >
            <span className="inline-flex"><HealthRing score={health.score} band={health.band} /></span>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold tracking-tight">{company.name_ar || company.name}</h1>
              <Badge variant={STATE_BADGE_VARIANT[state]}>{t(`platform.state.${state}`)}</Badge>
              {company.plan_key && <Badge variant="secondary" dir="ltr">{company.plan_key}</Badge>}
              <Badge variant={BAND_BADGE[health.band]}>
                {t(`platform.company.health.band.${health.band}`)} · {health.score}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
              {left == null
                ? t('platform.company.trial.none')
                : left < 0
                  ? t('platform.overview.daysAgo', { n: Math.abs(left) })
                  : t('platform.overview.daysLeft', { n: left })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/platform/companies/${company.id}/analytics`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <LineChart className="h-4 w-4" /> {t('companyAnalytics.viewAnalytics')}
            </Link>
            <Link
              href={`/platform/companies/${company.id}/view-as`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Eye className="h-4 w-4" /> {t('platform.viewAs.title')}
            </Link>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => renewBy(1)}>
              <CalendarPlus className="h-4 w-4" /> {t('platform.company.subscription.renewOneMonth')}
            </Button>
            <Button
              variant={company.is_active ? 'outline' : 'default'}
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => setCompanyActive(company.id, !company.is_active),
                  company.is_active
                    ? t('platform.company.subscription.toastSuspended')
                    : t('platform.company.subscription.toastActivated'),
                )
              }
            >
              <Power className="h-4 w-4" />
              {company.is_active
                ? t('platform.company.subscription.suspendCompany')
                : t('platform.company.subscription.activateCompany')}
            </Button>
          </div>
        </div>

        {/* Mobile section selector (replaces the side rail on <lg) — scrollable
            segmented chips; tapping switches the single visible section. */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto lg:hidden">
          {SECTION_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              aria-current={active === k ? 'true' : undefined}
              onClick={() => goToSection(k)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active === k ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {railLabels[k]}
            </button>
          ))}
        </div>
      </div>

      {/* ── T1: condensed status card (above the fold) ─────────────────────── */}
      <Card className="mb-4 overflow-hidden">
        <CardContent className="grid grid-cols-2 gap-px bg-border p-0 sm:grid-cols-4">
          <div className="bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.health.title')}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${BAND_RING[health.band]}`} dir="ltr">
              {health.score}
            </p>
            <p className="text-xs text-muted-foreground">{t(`platform.company.health.band.${health.band}`)}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.c360.statusExpiry')}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${expiryTone === 'destructive' ? 'text-destructive' : expiryTone === 'warning' ? 'text-warning' : ''}`} dir="ltr">
              {left == null ? '∞' : left}
            </p>
            <p className="text-xs text-muted-foreground">{t('platform.company.c360.statusUsers')}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.c360.statusApprovals')}</p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${(props.pendingApprovals ?? 0) > 0 ? 'text-warning' : ''}`} dir="ltr">
              {props.pendingApprovals == null ? '—' : props.pendingApprovals}
            </p>
          </div>
          <div className="bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('platform.company.c360.statusUsers')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums" dir="ltr">{props.totalUsers}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <button key={k.label} type="button" onClick={() => goToSection(k.section)} className="text-start">
            <StatCard label={k.label} value={k.value} icon={k.icon} tone={k.tone} />
          </button>
        ))}
      </div>

      <div className="lg:flex lg:gap-6">
        {/* ── Desktop section rail (real section switching, not scroll anchors) ── */}
        <nav className="hidden w-48 shrink-0 lg:block">
          <div className="sticky top-32 space-y-1">
            {SECTION_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                aria-current={active === k ? 'true' : undefined}
                onClick={() => goToSection(k)}
                className={`block w-full rounded-md px-3 py-2 text-start text-sm transition-colors ${
                  active === k
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                {railLabels[k]}
              </button>
            ))}
          </div>
        </nav>

        {/* Active section only — single-section view (no long scroll page). */}
        <div className="min-w-0 flex-1">{renderSection(active)}</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Clock; title: string }) {
  return (
    <h2 className="mb-3 hidden items-center gap-2 text-lg font-semibold lg:flex">
      <Icon className="h-5 w-5 text-muted-foreground" /> {title}
    </h2>
  );
}

/** Read-only plan-limit usage panel for the Usage section (no writes). */
function UsageSection({ plans, company, usage }: { plans: Plan[]; company: Company; usage: CompanyUsage }) {
  const { t } = useI18n();
  const plan = plans.find((p) => p.key === company.plan_key) ?? null;
  const fmt = (n: number, max: number | null | undefined) => (max == null ? `${n} / ∞` : `${n} / ${max}`);
  const over = (n: number, max: number | null | undefined) => max != null && n >= max;
  const items = [
    { label: t('platform.company.plan.metricUsers'), used: usage.users, max: plan?.max_users },
    { label: t('platform.company.plan.metricBranches'), used: usage.branches, max: plan?.max_branches },
    { label: t('platform.company.plan.metricProducts'), used: usage.products, max: plan?.max_products },
  ];
  return (
    <Card>
      <CardContent className="grid grid-cols-3 gap-3 pt-6">
        {items.map((it) => (
          <div key={it.label} className="rounded-md border p-3 text-center">
            <p className="text-xs text-muted-foreground">{it.label}</p>
            <p className={`text-lg font-bold tabular-nums ${over(it.used, it.max) ? 'text-destructive' : ''}`} dir="ltr">
              {fmt(it.used, it.max)}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
