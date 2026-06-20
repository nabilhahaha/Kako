'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Activity, AlertTriangle, ClipboardCheck, MapPin, CheckCircle2, Lightbulb, ListChecks, Plus, ArrowRight, Target } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { computeMissionKpis, bucketMissions, type MissionLite, type VisitKpis } from '@/lib/erp/route-planner-kpi';
import type { MissionPerms } from '@/lib/erp/route-planner-access';
import { missionDashboard } from './rp-mission-actions';
import { listMyPlanApprovals, advancePlanApproval, type PlanKind } from './rp-plan-actions';
import { ManagerDashboard } from './manager-dashboard';

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Planner Dashboard — the home overview. PLANNER-ONLY KPIs (visits, missions, plans,
 * observations); no sales/revenue/collections/finance metrics. Role-aware: a manager
 * (assign capability) also sees a team status strip. Clean cards, obvious next actions.
 */
export function PlannerDashboard({ userId, perms, onOpenMissions, onNewMission }: {
  userId: string | null; perms: MissionPerms; onOpenMissions: (scope: 'all' | 'assigned') => void; onNewMission: () => void;
}) {
  const { t } = useI18n();
  // Managers (assign/review capability) get the premium operations cockpit.
  if (perms.canAssign || perms.canReview) {
    return <ManagerDashboard userId={userId} perms={perms} onOpenMissions={onOpenMissions} onNewMission={onNewMission} />;
  }
  return <SupervisorDashboard userId={userId} perms={perms} onOpenMissions={onOpenMissions} onNewMission={onNewMission} />;
}

function SupervisorDashboard({ userId, perms, onOpenMissions, onNewMission }: {
  userId: string | null; perms: MissionPerms; onOpenMissions: (scope: 'all' | 'assigned') => void; onNewMission: () => void;
}) {
  const { t } = useI18n();
  const [all, setAll] = useState<MissionLite[]>([]);
  const [visit, setVisit] = useState<VisitKpis>({ completedVisits: 0, missedVisits: 0, stopsWithIssues: 0, stopsWithOpportunities: 0, followUps: 0 });
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<{ kind: PlanKind; id: string; name: string }[]>([]);
  const [busyAppr, setBusyAppr] = useState<string | null>(null);

  function loadApprovals() { void listMyPlanApprovals().then((r) => { if (r.ok) setApprovals(r.data ?? []); }); }
  useEffect(() => {
    let on = true;
    void missionDashboard().then((r) => { if (on && r.ok && r.data) { setAll(r.data.all); setVisit(r.data.visit); } if (on) setLoading(false); });
    loadApprovals();
    return () => { on = false; };
  }, []);

  async function actOnPlan(kind: PlanKind, id: string, action: 'approve' | 'reject') {
    setBusyAppr(id);
    await advancePlanApproval(kind, id, action);
    setBusyAppr(null);
    loadApprovals();
  }

  const today = TODAY();
  const k = useMemo(() => computeMissionKpis(all, today), [all, today]);
  const mine = useMemo(() => all.filter((m) => m.assignedTo === userId), [all, userId]);
  const myBuckets = useMemo(() => bucketMissions(mine, today), [mine, today]);
  const isManager = perms.canAssign || perms.canReview;

  const cards = [
    { v: k.today, label: t('rpShell.kpi_today'), icon: CalendarClock, tone: 'text-sky-600' },
    { v: k.active, label: t('rpShell.kpi_active'), icon: Activity, tone: 'text-amber-600' },
    { v: k.overdue, label: t('rpShell.kpi_overdue'), icon: AlertTriangle, tone: 'text-red-600' },
    { v: k.pendingReports, label: t('rpShell.kpi_pendingReports'), icon: ClipboardCheck, tone: 'text-violet-600' },
    { v: k.plannedVisits, label: t('rpShell.kpi_plannedVisits'), icon: MapPin, tone: 'text-primary' },
    { v: visit.completedVisits, label: t('rpShell.kpi_completedVisits'), icon: CheckCircle2, tone: 'text-emerald-600' },
    { v: visit.stopsWithIssues, label: t('rpShell.kpi_issues'), icon: AlertTriangle, tone: 'text-orange-600' },
    { v: visit.stopsWithOpportunities, label: t('rpShell.kpi_opportunities'), icon: Lightbulb, tone: 'text-yellow-600' },
    { v: visit.followUps, label: t('rpShell.kpi_followUps'), icon: ListChecks, tone: 'text-teal-600' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between">
              <c.icon className={`h-4 w-4 ${c.tone}`} />
              <span className="text-xl font-bold tabular-nums">{loading ? '·' : c.v}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      {/* My missions today / overdue */}
      <div className="rounded-2xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold"><Target className="h-4 w-4 text-primary" /> {t('rpShell.db_myToday')}</p>
          <button onClick={() => onOpenMissions('assigned')} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">{t('rpShell.db_viewMine')} <ArrowRight className="h-3 w-3" /></button>
        </div>
        {myBuckets.today.length === 0 && myBuckets.overdue.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{t('rpShell.db_noToday')}</p>
        ) : (
          <div className="space-y-1.5">
            {myBuckets.overdue.length > 0 && <p className="text-[11px] font-semibold text-red-600">{t('rpShell.kpi_overdue')}: {myBuckets.overdue.length}</p>}
            {[...myBuckets.today, ...myBuckets.overdue].slice(0, 6).map((m, i) => (
              <button key={i} onClick={() => onOpenMissions('assigned')} className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm hover:bg-muted/50">
                <span className="truncate">{t('rpShell.mn_stops', { n: m.stopCount })}{m.missionDate ? ` · ${m.missionDate}` : ''}</span>
                <span className="text-[11px] text-muted-foreground">{t(`rpShell.ms_${m.status}` as Parameters<typeof t>[0])}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Manager: team status overview */}
      {isManager && (
        <div className="rounded-2xl border p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4 text-primary" /> {t('rpShell.db_team')}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {([['ms_draft', k.draft], ['ms_assigned', k.assigned], ['ms_in_progress', k.inProgress], ['ms_completed', k.completed], ['ms_reviewed', k.reviewed], ['ms_archived', k.archived]] as const).map(([key, val]) => (
              <div key={key} className="rounded-lg bg-muted/30 p-2 text-center">
                <p className="text-base font-bold tabular-nums">{val}</p>
                <p className="text-[10px] text-muted-foreground">{t(`rpShell.${key}` as Parameters<typeof t>[0])}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan approvals inbox (Wave K) — where I'm the pending approver. */}
      {approvals.length > 0 && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold"><ClipboardCheck className="h-4 w-4 text-violet-600" /> {t('rpShell.pa_inbox')} <span className="text-violet-600">({approvals.length})</span></p>
          <ul className="space-y-1.5">
            {approvals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{a.name} <span className="text-[11px] text-muted-foreground">· {t(`rpShell.rc_type_${a.kind === 'journey' ? 'journey_plan' : 'daily_plan'}` as Parameters<typeof t>[0])}</span></span>
                <div className="flex gap-1.5">
                  <button disabled={busyAppr === a.id} onClick={() => void actOnPlan(a.kind, a.id, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">{t('rpShell.pa_approve')}</button>
                  <button disabled={busyAppr === a.id} onClick={() => void actOnPlan(a.kind, a.id, 'reject')} className="rounded-lg border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50">{t('rpShell.pa_reject')}</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {perms.canCreate && <Button onClick={onNewMission}><Plus className="h-4 w-4" /> {t('rpShell.mn_new')}</Button>}
        <Button variant="outline" onClick={() => onOpenMissions('all')}><Target className="h-4 w-4" /> {t('rpShell.db_allMissions')}</Button>
      </div>
    </div>
  );
}
