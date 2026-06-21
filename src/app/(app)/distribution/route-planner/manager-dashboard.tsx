'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Activity, AlertTriangle, ClipboardCheck, MapPin, CheckCircle2, Lightbulb, ListChecks,
  Plus, ArrowRight, Target, Users, Swords, Camera, Image as ImageIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { computeMissionKpis, bucketMissions, type MissionLite, type VisitKpis } from '@/lib/erp/route-planner-kpi';
import type { MissionPerms } from '@/lib/erp/route-planner-access';
import { missionDashboard, missionMapStops, recentFieldObservations, listMissions } from './rp-mission-actions';
import { listMyPlanApprovals, advancePlanApproval, type PlanKind } from './rp-plan-actions';
import { listAssignableUsers } from './rp-mission-actions';
import { SelectionMap, type SelMapPoint } from './selection-map';
import type { MissionHeader } from './rp-mission-actions';

const TODAY = () => new Date().toISOString().slice(0, 10);
const STOP_COLOR: Record<string, string> = { pending: '#94a3b8', checked_in: '#f59e0b', done: '#10b981', skipped: '#cbd5e1' };
const OBS_ICON: Record<string, typeof AlertTriangle> = { issue: AlertTriangle, opportunity: Lightbulb, competitor: Swords, photo: Camera };

/** A compact circular progress gauge (SVG ring). */
function Gauge({ pct, label }: { pct: number; label: string }) {
  const r = 26, c = 2 * Math.PI * r, off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-muted" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} className="text-primary transition-all" />
      </svg>
      <div><p className="text-2xl font-bold tabular-nums">{pct}%</p><p className="text-[11px] text-muted-foreground">{label}</p></div>
    </div>
  );
}

/**
 * Manager Dashboard — a premium, Arabic-first cockpit for Planner field operations.
 * PLANNER-ONLY (missions, visits, plans, observations) — no sales/revenue/finance. All
 * data is real + RLS-scoped to the manager's reporting subtree. Mobile: single column.
 */
export function ManagerDashboard({ userId, perms, onOpenMissions, onNewMission }: {
  userId: string | null; perms: MissionPerms; onOpenMissions: (scope: 'all' | 'assigned') => void; onNewMission: () => void;
}) {
  const { t } = useI18n();
  const [all, setAll] = useState<MissionLite[]>([]);
  const [missions, setMissions] = useState<MissionHeader[]>([]);
  const [visit, setVisit] = useState<VisitKpis>({ completedVisits: 0, missedVisits: 0, stopsWithIssues: 0, stopsWithOpportunities: 0, followUps: 0 });
  const [stops, setStops] = useState<{ id: string; name: string; lat: number; lng: number; status: string; mission: string }[]>([]);
  const [obs, setObs] = useState<{ id: string; kind: string; text: string | null; customer: string | null; mission: string; at: number; photos: number }[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [approvals, setApprovals] = useState<{ kind: PlanKind; id: string; name: string }[]>([]);
  const [busyAppr, setBusyAppr] = useState<string | null>(null);

  function loadApprovals() { void listMyPlanApprovals().then((r) => { if (r.ok) setApprovals(r.data ?? []); }); }
  useEffect(() => {
    let on = true;
    void missionDashboard().then((r) => { if (on && r.ok && r.data) { setAll(r.data.all); setVisit(r.data.visit); } });
    void missionMapStops().then((r) => { if (on && r.ok) setStops(r.data ?? []); });
    void recentFieldObservations(12).then((r) => { if (on && r.ok) setObs(r.data ?? []); });
    void listMissions('all').then((r) => { if (on && r.ok) setMissions(r.data ?? []); });
    void listAssignableUsers().then((r) => { if (on && r.ok) setPeople(r.data ?? []); });
    loadApprovals();
    return () => { on = false; };
  }, []);

  const today = TODAY();
  const k = useMemo(() => computeMissionKpis(all, today), [all, today]);
  const nameOf = useMemo(() => { const m = new Map(people.map((p) => [p.id, p.name])); return (id: string | null) => (id ? m.get(id) ?? t('rpShell.mn_someone') : t('rpShell.mn_unassigned')); }, [people, t]);
  const completionPct = k.plannedVisits > 0 ? Math.round((visit.completedVisits / k.plannedVisits) * 100) : 0;

  // Top supervisors today: today's missions grouped by assignee.
  const topSupervisors = useMemo(() => {
    const m = new Map<string, { active: number; done: number; total: number }>();
    for (const mis of missions) {
      if (mis.missionDate !== today || !mis.assignedTo) continue;
      const e = m.get(mis.assignedTo) ?? { active: 0, done: 0, total: 0 };
      e.total++;
      if (mis.status === 'in_progress' || mis.status === 'assigned') e.active++;
      if (mis.status === 'completed' || mis.status === 'reviewed') e.done++;
      m.set(mis.assignedTo, e);
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total).slice(0, 8);
  }, [missions, today]);

  const mapPoints: SelMapPoint[] = useMemo(() => stops.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, color: STOP_COLOR[s.status] ?? '#94a3b8' })), [stops]);

  async function actOnPlan(kind: PlanKind, id: string, action: 'approve' | 'reject') {
    setBusyAppr(id); await advancePlanApproval(kind, id, action); setBusyAppr(null); loadApprovals();
  }

  const kpis = [
    { v: k.today, label: t('rpShell.kpi_today'), icon: CalendarClock, tone: 'bg-sky-50 text-sky-600' },
    { v: k.active, label: t('rpShell.kpi_active'), icon: Activity, tone: 'bg-amber-50 text-amber-600' },
    { v: k.overdue, label: t('rpShell.kpi_overdue'), icon: AlertTriangle, tone: 'bg-red-50 text-red-600' },
    { v: k.pendingReports, label: t('rpShell.kpi_pendingReports'), icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-600' },
    { v: visit.stopsWithOpportunities, label: t('rpShell.kpi_opportunities'), icon: Lightbulb, tone: 'bg-yellow-50 text-yellow-600' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI row + completion gauge */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(all.length === 0 && kpis.length === 0 ? Array.from({ length: 5 }) : kpis).map((c, i) => {
          const card = c as typeof kpis[number] | undefined;
          return (
            <div key={card?.label ?? i} className="rounded-2xl border bg-card p-3 shadow-sm">
              {card ? <>
                <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${card.tone}`}><card.icon className="h-4 w-4" /></div>
                <p className="text-2xl font-bold tabular-nums">{card.v}</p>
                <p className="text-[11px] text-muted-foreground">{card.label}</p>
              </> : <div className="space-y-2"><div className="h-8 w-8 animate-pulse rounded-lg bg-muted" /><div className="h-6 w-10 animate-pulse rounded bg-muted" /><div className="h-3 w-16 animate-pulse rounded bg-muted/60" /></div>}
            </div>
          );
        })}
        <div className="col-span-2 flex items-center justify-center rounded-2xl border bg-card p-3 shadow-sm sm:col-span-1">
          <Gauge pct={completionPct} label={t('rpShell.kpi_completedVisits')} />
        </div>
      </div>

      {/* Map + Top supervisors */}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-primary" /> {t('rpShell.db_missionMap')}</p>
            <span className="text-[11px] text-muted-foreground">{stops.length}</span>
          </div>
          {mapPoints.length > 0 ? (
            <div className="h-[320px]"><SelectionMap points={mapPoints} hulls={[]} selectedIds={new Set()} focusIds={new Set()} routeOptions={[]} selectMode="pan" fill onToggle={() => {}} onBoxSelect={() => {}} onMoveSingle={() => {}} onContextMenu={() => {}} onSelecting={() => {}} /></div>
          ) : (
            <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground"><MapPin className="h-8 w-8 text-muted-foreground/40" /><p>{t('rpShell.db_noActiveMissions')}</p></div>
          )}
        </div>

        <div className="rounded-2xl border shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-primary" /> {t('rpShell.db_topSupervisors')}</p>
            <button onClick={() => onOpenMissions('all')} className="text-[11px] text-primary hover:underline">{t('rpShell.db_allMissions')}</button>
          </div>
          {topSupervisors.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">{t('rpShell.db_noToday')}</p>
          ) : (
            <ul className="divide-y">
              {topSupervisors.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{nameOf(s.id).slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{nameOf(s.id)}</p>
                    <p className="text-[11px] text-muted-foreground">{t('rpShell.mn_stops', { n: s.total })}</p></div>
                  <div className="flex shrink-0 gap-1 text-[10px]">
                    {s.active > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">{s.active}</span>}
                    {s.done > 0 && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">{s.done}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Field observations + Plan/mission status */}
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border shadow-sm">
          <p className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-orange-500" /> {t('rpShell.db_fieldFeed')}</p>
          {obs.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">{t('rpShell.db_noObs')}</p>
          ) : (
            <ul className="max-h-[280px] divide-y overflow-auto">
              {obs.map((o) => { const Icon = OBS_ICON[o.kind] ?? AlertTriangle; return (
                <li key={o.id} className="flex items-start gap-2 px-3 py-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{o.text || t(`rpShell.mn_obs${o.kind.charAt(0).toUpperCase() + o.kind.slice(1)}` as Parameters<typeof t>[0])}</p>
                    <p className="text-[11px] text-muted-foreground">{o.customer ? `${o.customer} · ` : ''}{o.mission}</p>
                  </div>
                  {o.photos > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><ImageIcon className="h-3 w-3" /> {o.photos}</span>}
                </li>
              ); })}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {/* Plan/mission status — proportional bar + counts (real data). */}
          <div className="rounded-2xl border p-3 shadow-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4 text-primary" /> {t('rpShell.db_team')}</p>
            {(() => {
              const segs = [
                { v: k.draft, c: 'bg-slate-300', key: 'ms_draft' },
                { v: k.assigned, c: 'bg-sky-400', key: 'ms_assigned' },
                { v: k.inProgress, c: 'bg-amber-400', key: 'ms_in_progress' },
                { v: k.completed, c: 'bg-emerald-400', key: 'ms_completed' },
                { v: k.reviewed, c: 'bg-violet-400', key: 'ms_reviewed' },
              ];
              const tot = segs.reduce((a, s) => a + s.v, 0);
              return tot === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">{t('rpShell.db_noMissionsYet')}</p>
              ) : (
                <>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                    {segs.map((s) => s.v > 0 && <div key={s.key} className={s.c} style={{ width: `${(s.v / tot) * 100}%` }} title={`${t(`rpShell.${s.key}` as Parameters<typeof t>[0])}: ${s.v}`} />)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {segs.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${s.c}`} /> {t(`rpShell.${s.key}` as Parameters<typeof t>[0])} <span className="font-semibold text-foreground tabular-nums">{s.v}</span>
                      </span>
                    ))}
                    {k.overdue > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-red-600"><AlertTriangle className="h-3 w-3" /> {t('rpShell.kpi_overdue')} <span className="font-semibold tabular-nums">{k.overdue}</span></span>}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Plan approvals inbox */}
          {approvals.length > 0 && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3 shadow-sm">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold"><ClipboardCheck className="h-4 w-4 text-violet-600" /> {t('rpShell.pa_inbox')} ({approvals.length})</p>
              <ul className="space-y-1.5">
                {approvals.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
                    <div className="flex gap-1">
                      <button disabled={busyAppr === a.id} onClick={() => void actOnPlan(a.kind, a.id, 'approve')} className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50">{t('rpShell.pa_approve')}</button>
                      <button disabled={busyAppr === a.id} onClick={() => void actOnPlan(a.kind, a.id, 'reject')} className="rounded border px-2 py-0.5 text-[11px] disabled:opacity-50">{t('rpShell.pa_reject')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        {perms.canCreate && <Button onClick={onNewMission}><Plus className="h-4 w-4" /> {t('rpShell.mn_new')}</Button>}
        <Button variant="outline" onClick={() => onOpenMissions('all')}><Target className="h-4 w-4" /> {t('rpShell.db_allMissions')}</Button>
        <Button variant="outline" onClick={() => onOpenMissions('assigned')}><ArrowRight className="h-4 w-4" /> {t('rpShell.db_viewMine')}</Button>
      </div>
    </div>
  );
}
