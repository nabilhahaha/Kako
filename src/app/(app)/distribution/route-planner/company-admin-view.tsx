'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Users, UserCog, ShieldCheck, Database, ClipboardList, Target, Network, GitBranch, Activity,
  CheckCircle2, RefreshCw, ArrowRight, Building2, Crown, Eye,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import type { RoutePlannerSubscriptionView } from '@/lib/erp/route-planner-subscription';
import { resolveMissionPerms, type RpRole } from '@/lib/erp/route-planner-access';
import { companyOverview, type CompanyOverview } from './rp-company-actions';
import { listReportingGraph } from './rp-reporting-actions';
import type { RpNode } from '@/lib/erp/route-planner-reporting';

export type AdminNavTarget = 'reporting' | 'approvals' | 'integration' | 'requests';

const SUB_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', trial: 'bg-sky-100 text-sky-700',
  expired: 'bg-red-100 text-red-700', suspended: 'bg-amber-100 text-amber-700',
};

/**
 * Company Admin Console — a premium, English-first, company-SCOPED admin surface for the
 * Planner. Company 360 (KPIs + profile + subscription + latest sync + active dataset),
 * a users & roles roster, and quick actions into the existing admin tools. Reuses real
 * data + RLS; a company admin only ever sees their OWN company. No platform/global data.
 */
export function CompanyAdminView({ subscription, companyName, onNavigate }: {
  subscription?: RoutePlannerSubscriptionView; companyName?: string | null; onNavigate: (t: AdminNavTarget) => void;
}) {
  const { t } = useI18n();
  const [ov, setOv] = useState<CompanyOverview | null>(null);
  const [nodes, setNodes] = useState<RpNode[]>([]);
  const [perms, setPerms] = useState<Record<string, { create?: boolean; assign?: boolean; review?: boolean }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    void companyOverview().then((r) => { if (on && r.ok) setOv(r.data ?? null); if (on) setLoading(false); });
    void listReportingGraph().then((r) => { if (on && r.ok) { setNodes(r.data!.nodes); setPerms(r.data!.missionPermsById ?? {}); } });
    return () => { on = false; };
  }, []);

  const nameOf = useMemo(() => { const m = new Map(nodes.map((n) => [n.userId, n.name])); return (id: string | null) => (id ? m.get(id) ?? id.slice(0, 8) : '—'); }, [nodes]);

  const kpis = ov ? [
    { v: ov.users.total, label: t('rpShell.ca_users'), icon: Users, tone: 'bg-sky-50 text-sky-600' },
    { v: ov.users.byRole.manager + ov.users.byRole.area_manager, label: t('rpShell.ca_managers'), icon: UserCog, tone: 'bg-violet-50 text-violet-600' },
    { v: ov.users.byRole.supervisor, label: t('rpShell.ca_supervisors'), icon: ShieldCheck, tone: 'bg-amber-50 text-amber-600' },
    { v: ov.users.byRole.field_user, label: t('rpShell.ca_fieldUsers'), icon: Users, tone: 'bg-teal-50 text-teal-600' },
    { v: ov.datasets.count, label: t('rpShell.ca_datasets'), icon: Database, tone: 'bg-indigo-50 text-indigo-600' },
    { v: ov.requests.pending, label: t('rpShell.ca_pendingReq'), icon: ClipboardList, tone: 'bg-orange-50 text-orange-600' },
    { v: ov.missions.active, label: t('rpShell.ca_activeMissions'), icon: Target, tone: 'bg-emerald-50 text-emerald-600' },
    { v: ov.users.active, label: t('rpShell.ca_activeUsers'), icon: Activity, tone: 'bg-rose-50 text-rose-600' },
  ] : [];

  const quick: { t: AdminNavTarget; label: string; icon: typeof Network; desc: string }[] = [
    { t: 'reporting', label: t('rpShell.ca_qReporting'), icon: Network, desc: t('rpShell.ca_qReportingD') },
    { t: 'approvals', label: t('rpShell.ca_qApprovals'), icon: GitBranch, desc: t('rpShell.ca_qApprovalsD') },
    { t: 'integration', label: t('rpShell.ca_qData'), icon: Database, desc: t('rpShell.ca_qDataD') },
    { t: 'requests', label: t('rpShell.ca_qRequests'), icon: ClipboardList, desc: t('rpShell.ca_qRequestsD') },
  ];

  const roleLabel = (r: string | null) => r ? t(`rpShell.rg_role_${(r as RpRole)}` as Parameters<typeof t>[0]) : t('rpShell.mp_executeOnly');

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-3">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        <p className="text-sm font-bold">{t('rpShell.ca_title')}</p>
        {companyName && <span className="text-xs text-muted-foreground">· {companyName}</span>}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {(loading ? Array.from({ length: 8 }) : kpis).map((c, i) => {
          const card = c as typeof kpis[number] | undefined;
          return (
            <div key={i} className="rounded-2xl border bg-card p-3 shadow-sm">
              {card ? <>
                <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${card.tone}`}><card.icon className="h-4 w-4" /></div>
                <p className="text-2xl font-bold tabular-nums">{card.v}</p>
                <p className="text-[11px] text-muted-foreground">{card.label}</p>
              </> : <div className="h-16 animate-pulse rounded bg-muted/40" />}
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        {/* Users & roles roster */}
        <div className="rounded-2xl border shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-primary" /> {t('rpShell.ca_usersRoles')}</p>
            <button onClick={() => onNavigate('reporting')} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">{t('rpShell.ca_manage')} <ArrowRight className="h-3 w-3" /></button>
          </div>
          {nodes.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">{t('rpShell.ca_noUsers')}</p>
          ) : (
            <ul className="max-h-[360px] divide-y overflow-auto">
              {nodes.slice(0, 30).map((n) => {
                const mp = resolveMissionPerms((n.role ?? 'field_user') as RpRole, perms[n.userId]);
                return (
                  <li key={n.userId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{n.name.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.name}{n.seeAll && <Crown className="ms-1 inline h-3 w-3 text-amber-500" />}</p>
                      <p className="text-[11px] text-muted-foreground">{roleLabel(n.role)}{n.primaryManagerId ? ` · ${nameOf(n.primaryManagerId)}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 gap-1 text-[10px]">
                      {mp.canCreate && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">{t('rpShell.mp_create')}</span>}
                      {mp.canAssign && <span className="rounded-full bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-700">{t('rpShell.mp_assign')}</span>}
                      {mp.canReview && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">{t('rpShell.mp_review')}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Company 360 card */}
        <div className="space-y-3">
          <div className="rounded-2xl border p-4 shadow-sm">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Building2 className="h-4 w-4 text-primary" /> {t('rpShell.ca_company360')}</p>
            <dl className="space-y-2 text-xs">
              {subscription && (
                <div className="flex items-center justify-between"><dt className="text-muted-foreground">{t('rpShell.ca_subscription')}</dt>
                  <dd><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SUB_TONE[subscription.status] ?? 'bg-muted'}`}>{subscription.status}</span>
                    {subscription.daysRemaining > 0 && <span className="ms-1 text-muted-foreground">{subscription.daysRemaining}d</span>}</dd></div>
              )}
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">{t('rpShell.ca_activeDataset')}</dt>
                <dd className="font-medium">{ov?.datasets.activeName ?? '—'}{ov?.datasets.activeName ? ` · ${ov.datasets.activeRows}` : ''}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">{t('rpShell.ca_latestSync')}</dt>
                <dd className="inline-flex items-center gap-1 font-medium">{ov?.latestSync ? <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> {new Date(ov.latestSync.at).toLocaleDateString()}</> : <span className="text-muted-foreground">—</span>}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-muted-foreground">{t('rpShell.ca_inGraph')}</dt>
                <dd className="font-medium">{ov ? `${ov.users.inGraph}/${ov.users.total}` : '—'}</dd></div>
            </dl>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => onNavigate('integration')}><RefreshCw className="h-3.5 w-3.5" /> {t('rpShell.ca_manageData')}</Button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <p className="mb-2 text-sm font-bold">{t('rpShell.ca_quickActions')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quick.map((q) => (
            <button key={q.t} onClick={() => onNavigate(q.t)} className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-start shadow-sm transition hover:border-primary/40 hover:shadow">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><q.icon className="h-5 w-5" /></div>
              <div className="min-w-0"><p className="font-semibold">{q.label}</p><p className="text-[11px] text-muted-foreground">{q.desc}</p></div>
            </button>
          ))}
        </div>
      </div>

      <p className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
        <Eye className="h-3.5 w-3.5 shrink-0" /> {t('rpShell.ca_scopeNote')}
      </p>
    </div>
  );
}
