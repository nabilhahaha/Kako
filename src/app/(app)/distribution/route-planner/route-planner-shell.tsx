'use client';

import { useState } from 'react';
import {
  Home, Map as MapIcon, CalendarRange, Bookmark, LayoutTemplate, Users, UsersRound, Filter, UploadCloud,
  Globe2, Building2, PencilRuler, UserCheck, ClipboardCheck, History, Images, AlertTriangle, Swords,
  Lightbulb, ListChecks, PieChart, Gauge, Timer, Repeat, UserX, ChevronDown, ChevronRight, Menu, X,
  Route as RouteIcon, LogOut, User as UserIcon, Database, Activity, ClipboardList, Inbox, Network, ShieldCheck, GitBranch, type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { LanguageToggle } from '@/components/layout/language-toggle';
import { Button } from '@/components/ui/button';
import type { RoutePlannerSubscriptionView } from '@/lib/erp/route-planner-subscription';
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import { RoutePlannerWorkspace } from './route-planner-workspace';
import { DayPlanner } from './day-planner';
import { CustomersView } from './customers-view';
import { TerritoriesView } from './territories-view';
import { IntegrationView } from './integration-view';
import { RequestCenterView } from './request-center-view';
import { ReportingAdminView } from './reporting-admin-view';
import { ApprovalBuilderView } from './approval-builder-view';

/** Route Planner feature grants. Mirrors the Field Missions Phase 0 access model
 *  (erp_route_planner_access); kept local here so this PR stays independent of #310. */
type RpFeature = 'route_planning' | 'day_planner' | 'field_missions' | 'reports';

type Action = 'planning' | 'dayPlanner' | 'customers' | 'segments' | 'import' | 'territories' | 'integration' | 'requests' | 'reporting' | 'approvals' | 'soon';
type Section = 'planning' | 'data' | 'operations' | 'admin';
interface NavItem { key: string; labelKey: string; icon: LucideIcon; action: Action }
interface NavGroup { key: string; labelKey: string; icon: LucideIcon; section: Section; feature?: RpFeature; adminOnly?: boolean; items: NavItem[] }

/** Top-level sidebar sections (a light header above the collapsible groups). */
const SECTIONS: { key: Section; labelKey: string }[] = [
  { key: 'planning', labelKey: 'sec_planning' },
  { key: 'data', labelKey: 'sec_data' },
  { key: 'operations', labelKey: 'sec_operations' },
  { key: 'admin', labelKey: 'sec_admin' },
];

const NAV: NavGroup[] = [
  { key: 'planning', labelKey: 'g_planning', icon: RouteIcon, section: 'planning', feature: 'route_planning', items: [
    { key: 'dayPlanner', labelKey: 'i_dayPlanner', icon: MapIcon, action: 'dayPlanner' },
    { key: 'routeBuilder', labelKey: 'i_routeBuilder', icon: RouteIcon, action: 'planning' },
    { key: 'weeklyPlanner', labelKey: 'i_weeklyPlanner', icon: CalendarRange, action: 'soon' },
    { key: 'savedPlans', labelKey: 'i_savedPlans', icon: Bookmark, action: 'soon' },
    { key: 'routeTemplates', labelKey: 'i_routeTemplates', icon: LayoutTemplate, action: 'soon' },
  ] },
  { key: 'customers', labelKey: 'g_customers', icon: Users, section: 'data', feature: 'route_planning', items: [
    { key: 'customerList', labelKey: 'i_customerList', icon: Users, action: 'customers' },
    { key: 'customerGroups', labelKey: 'i_customerGroups', icon: UsersRound, action: 'soon' },
    { key: 'savedSegments', labelKey: 'i_savedSegments', icon: Filter, action: 'segments' },
    { key: 'importCustomers', labelKey: 'i_importCustomers', icon: UploadCloud, action: 'import' },
  ] },
  { key: 'territories', labelKey: 'g_territories', icon: Globe2, section: 'data', feature: 'route_planning', items: [
    { key: 'regions', labelKey: 'i_regions', icon: Globe2, action: 'territories' },
    { key: 'cities', labelKey: 'i_cities', icon: Building2, action: 'territories' },
    { key: 'drawAreas', labelKey: 'i_drawAreas', icon: PencilRuler, action: 'soon' },
    { key: 'territoryAssignment', labelKey: 'i_territoryAssignment', icon: UserCheck, action: 'soon' },
  ] },
  { key: 'execution', labelKey: 'g_execution', icon: ClipboardCheck, section: 'operations', feature: 'field_missions', items: [
    { key: 'supervisorVisits', labelKey: 'i_supervisorVisits', icon: ClipboardCheck, action: 'soon' },
    { key: 'customerVisitHistory', labelKey: 'i_customerVisitHistory', icon: History, action: 'soon' },
    { key: 'photosEvidence', labelKey: 'i_photosEvidence', icon: Images, action: 'soon' },
    { key: 'marketIssues', labelKey: 'i_marketIssues', icon: AlertTriangle, action: 'soon' },
    { key: 'competitorActivities', labelKey: 'i_competitorActivities', icon: Swords, action: 'soon' },
    { key: 'opportunities', labelKey: 'i_opportunities', icon: Lightbulb, action: 'soon' },
    { key: 'followUpActions', labelKey: 'i_followUpActions', icon: ListChecks, action: 'soon' },
  ] },
  { key: 'analytics', labelKey: 'g_analytics', icon: PieChart, section: 'operations', feature: 'reports', items: [
    { key: 'coverage', labelKey: 'i_coverage', icon: PieChart, action: 'soon' },
    { key: 'routeEfficiency', labelKey: 'i_routeEfficiency', icon: Gauge, action: 'soon' },
    { key: 'distanceTime', labelKey: 'i_distanceTime', icon: Timer, action: 'soon' },
    { key: 'visitFrequency', labelKey: 'i_visitFrequency', icon: Repeat, action: 'soon' },
    { key: 'unvisitedCustomers', labelKey: 'i_unvisitedCustomers', icon: UserX, action: 'soon' },
  ] },
  { key: 'integrations', labelKey: 'g_integrations', icon: Database, section: 'data', feature: 'route_planning', items: [
    { key: 'dataSources', labelKey: 'i_dataSources', icon: Database, action: 'integration' },
    { key: 'syncHistory', labelKey: 'i_syncHistory', icon: History, action: 'integration' },
    { key: 'dataHealth', labelKey: 'i_dataHealth', icon: Activity, action: 'integration' },
  ] },
  { key: 'requests', labelKey: 'g_requests', icon: ClipboardList, section: 'operations', feature: 'route_planning', items: [
    { key: 'allRequests', labelKey: 'i_allRequests', icon: Inbox, action: 'requests' },
    { key: 'newRequest', labelKey: 'i_newRequest', icon: ClipboardList, action: 'requests' },
  ] },
  { key: 'admin', labelKey: 'g_admin', icon: ShieldCheck, section: 'admin', adminOnly: true, items: [
    { key: 'reportingGraph', labelKey: 'i_reportingGraph', icon: Network, action: 'reporting' },
    { key: 'approvalBuilder', labelKey: 'i_approvalBuilder', icon: GitBranch, action: 'approvals' },
  ] },
];

/**
 * Route Planner / Field Operations SHELL (redesign Phase A). A professional dashboard
 * frame — persistent top bar (Home · AR/EN · Profile · Logout) + a collapsible left
 * sidebar tree — that hosts the existing Route Planner workspace as a workspace panel
 * (the map is no longer the whole app). The Day Planner is reached from the sidebar and
 * runs on the existing, dataset-fed engine (no logic rebuilt). Groups the user's
 * `features` (erp_route_planner_access) don't include are hidden.
 */
export function RoutePlannerShell({ subscription, demo = false, userEmail, features, isAdmin = false }: {
  subscription?: RoutePlannerSubscriptionView;
  demo?: boolean;
  userEmail?: string | null;
  /** Route Planner feature grants; null = unrestricted (sees all groups). */
  features: RpFeature[] | null;
  /** Company admin (or platform/super/RP admin) — gates the Administration group. */
  isAdmin?: boolean;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<'home' | 'planning' | 'dayPlanner' | 'customers' | 'territories' | 'integration' | 'requests' | 'reporting' | 'approvals' | 'soon'>('home');
  const [custFocusSegments, setCustFocusSegments] = useState(false);
  const [terrGroup, setTerrGroup] = useState<'region' | 'city' | 'area'>('region');
  const [soonLabel, setSoonLabel] = useState('');
  const [active, setActive] = useState<string>('home');
  const [open, setOpen] = useState<Record<string, boolean>>({ planning: true });
  const [drawer, setDrawer] = useState(false); // mobile sidebar
  const [profileOpen, setProfileOpen] = useState(false);
  const [seed, setSeed] = useState<DpCustomer[]>([]); // customers from the Route Builder upload

  const can = (f?: RpFeature) => !f || features === null || features.includes(f);
  const groups = NAV.filter((g) => (g.adminOnly ? isAdmin : can(g.feature)));

  function go(item: NavItem) {
    setActive(item.key);
    setDrawer(false);
    if (item.action === 'dayPlanner') setView('dayPlanner');
    else if (item.action === 'planning') setView('planning');
    else if (item.action === 'customers') { setCustFocusSegments(false); setView('customers'); }
    else if (item.action === 'segments') { setCustFocusSegments(true); setView('customers'); }
    else if (item.action === 'import') setView('planning'); // shared import wizard lives in the Route Builder
    else if (item.action === 'territories') { setTerrGroup(item.key === 'cities' ? 'city' : 'region'); setView('territories'); }
    else if (item.action === 'integration') setView('integration');
    else if (item.action === 'requests') setView('requests');
    else if (item.action === 'reporting') setView('reporting');
    else if (item.action === 'approvals') setView('approvals');
    else { setSoonLabel(t(`rpShell.${item.labelKey}` as Parameters<typeof t>[0])); setView('soon'); }
  }
  function goHome() { setActive('home'); setView('home'); setDrawer(false); }

  const renderGroup = (g: NavGroup) => {
    const isOpen = open[g.key] ?? false;
    return (
      <div key={g.key}>
        <button onClick={() => setOpen((s) => ({ ...s, [g.key]: !isOpen }))} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 font-semibold text-foreground/80 hover:bg-muted">
          <g.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-start">{t(`rpShell.${g.labelKey}` as Parameters<typeof t>[0])}</span>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />}
        </button>
        {isOpen && (
          <div className="ms-3 border-s ps-1">
            {g.items.map((it) => (
              <button key={it.key} onClick={() => go(it)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition ${active === it.key ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                <it.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t(`rpShell.${it.labelKey}` as Parameters<typeof t>[0])}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Sidebar = (
    <nav className="flex h-full w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-e bg-muted/20 p-2 text-sm">
      {SECTIONS.map((sec) => {
        const secGroups = groups.filter((g) => g.section === sec.key);
        if (secGroups.length === 0) return null;
        return (
          <div key={sec.key} className="mb-1">
            <p className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{t(`rpShell.${sec.labelKey}` as Parameters<typeof t>[0])}</p>
            {secGroups.map(renderGroup)}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Top bar — always visible (desktop + mobile). */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <button onClick={() => setDrawer((d) => !d)} className="rounded-lg p-1.5 hover:bg-muted lg:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><RouteIcon className="h-4 w-4" /></div>
          <span className="text-sm font-bold">VANTORA</span>
          {demo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Demo</span>}
        </div>
        <button onClick={goHome} className={`ms-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${view === 'home' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
          <Home className="h-4 w-4" /> <span className="hidden sm:inline">{t('rpShell.home')}</span>
        </button>
        <div className="ms-auto flex items-center gap-2">
          <LanguageToggle />
          <div className="relative">
            <button onClick={() => setProfileOpen((o) => !o)} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted">
              <UserIcon className="h-4 w-4" /> <span className="hidden max-w-[140px] truncate sm:inline">{userEmail ?? t('rpShell.profile')}</span>
            </button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setProfileOpen(false)} />
                <div className="absolute end-0 z-30 mt-1 w-56 rounded-lg border bg-background p-1 shadow-lg">
                  <div className="truncate px-3 py-2 text-xs text-muted-foreground">{userEmail}</div>
                  <form action="/auth/signout" method="post">
                    <button type="submit" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm text-red-600 hover:bg-muted"><LogOut className="h-4 w-4" /> {t('rpShell.logout')}</button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">{Sidebar}</div>
        {/* Mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
            <div className="absolute inset-y-0 start-0 bg-background shadow-xl">
              <div className="flex h-12 items-center justify-between border-b px-3"><span className="text-sm font-bold">VANTORA</span><button onClick={() => setDrawer(false)}><X className="h-5 w-5" /></button></div>
              {Sidebar}
            </div>
          </div>
        )}

        {/* Content — the map lives INSIDE here, never over the sidebar. */}
        <main className="min-w-0 flex-1 overflow-auto">
          {/* Workspace stays mounted to preserve its dataset + feed the Day Planner seed;
              shown only in the planning view. */}
          <div className={view === 'planning' ? 'h-full' : 'hidden'}>
            <RoutePlannerWorkspace focus embedded demo={demo} subscription={subscription} onSeedChange={setSeed} />
          </div>

          {/* Day Planner — runs INSIDE the content area (sidebar + top bar stay visible),
              on the existing engine, fed by the Route Builder's uploaded customers. */}
          {view === 'dayPlanner' && (
            <div className="h-full">
              <DayPlanner embedded hasSalesDefault={seed.some((c) => (c.sales ?? 0) > 0)} seedCustomers={seed} autoUseDataset={seed.length > 0} onClose={goHome} />
            </div>
          )}

          {/* Customers — list + filters + saved segments over the loaded dataset. */}
          {view === 'customers' && (
            <div className="h-full">
              <CustomersView customers={seed} focusSegments={custFocusSegments} onImport={() => { setActive('importCustomers'); setView('planning'); }} />
            </div>
          )}

          {/* Territories — Region/City/Area aggregates over the loaded dataset. */}
          {view === 'territories' && (
            <div className="h-full">
              <TerritoriesView customers={seed} initialGroup={terrGroup} onImport={() => { setActive('importCustomers'); setView('planning'); }} />
            </div>
          )}

          {/* Integrations — Manual Upload connector + Data Health + Sync History. */}
          {view === 'integration' && (
            <div className="h-full">
              <IntegrationView />
            </div>
          )}

          {/* Request Center — trackable customer/route tickets (routing only). */}
          {view === 'requests' && (
            <div className="h-full">
              <RequestCenterView />
            </div>
          )}

          {/* Administration — Reporting Graph + Visibility Explorer (admin only). */}
          {view === 'reporting' && (
            <div className="h-full">
              <ReportingAdminView />
            </div>
          )}

          {/* Administration — Approval Builder (admin only). */}
          {view === 'approvals' && (
            <div className="h-full">
              <ApprovalBuilderView />
            </div>
          )}

          {view === 'home' && (
            <div className="mx-auto max-w-3xl p-6">
              <h1 className="text-xl font-bold">{t('rpShell.dashboardWelcome')}</h1>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={() => { setActive('dayPlanner'); setView('dayPlanner'); }} className="flex items-start gap-3 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-start hover:bg-primary/10">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><MapIcon className="h-5 w-5" /></div>
                  <div><p className="font-bold">{t('rpShell.buildTodayRoute')}</p><p className="text-xs text-muted-foreground">{t('rpShell.buildTodayRouteHint')}</p></div>
                </button>
                <button onClick={() => { setActive('routeBuilder'); setView('planning'); }} className="flex items-start gap-3 rounded-2xl border p-5 text-start hover:border-primary hover:bg-muted/40">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground"><RouteIcon className="h-5 w-5" /></div>
                  <div><p className="font-bold">{t('rpShell.openRouteBuilder')}</p><p className="text-xs text-muted-foreground">{t('rpShell.openRouteBuilderHint')}</p></div>
                </button>
              </div>
            </div>
          )}

          {view === 'soon' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <LayoutTemplate className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-lg font-semibold">{soonLabel}</p>
              <p className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{t('rpShell.comingSoon')}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{t('rpShell.comingSoonHint')}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
