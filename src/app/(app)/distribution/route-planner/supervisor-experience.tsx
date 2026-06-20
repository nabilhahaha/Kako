'use client';

import { useEffect, useMemo, useState } from 'react';
import { Target, ChevronLeft, ChevronRight, MapPin, Calendar, CheckCircle2, Clock, AlertTriangle, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { bucketMissions } from '@/lib/erp/route-planner-kpi';
import type { MissionPerms } from '@/lib/erp/route-planner-access';
import type { MissionStatus } from '@/lib/erp/route-planner-mission';
import { listMissions, type MissionHeader } from './rp-mission-actions';
import { MissionDetail } from './missions-view';

const TODAY = () => new Date().toISOString().slice(0, 10);
const STATUS_TONE: Record<MissionStatus, string> = {
  draft: 'bg-slate-100 text-slate-700', assigned: 'bg-sky-100 text-sky-700', in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700', reviewed: 'bg-violet-100 text-violet-700', archived: 'bg-muted text-muted-foreground',
};

/**
 * Supervisor Experience — a DEDICATED mobile-first journey (not just a stacked desktop
 * layout). My Missions bucketed Today / Overdue / Upcoming / Done, large tap targets,
 * one clear next action, minimal clutter; tapping opens the mobile mission detail
 * (check-in/out, photos, notes, issues, complete, report). Reuses MissionDetail.
 */
export function SupervisorExperience({ perms }: { perms: MissionPerms }) {
  const { t, dir } = useI18n();
  const [missions, setMissions] = useState<MissionHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const r = await listMissions('assigned');
    if (r.ok) setMissions(r.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  const today = TODAY();
  const b = useMemo(() => bucketMissions(missions, today), [missions, today]);
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;

  if (openId) {
    return (
      <div className="mx-auto max-w-md">
        <MissionDetail missionId={openId} perms={perms} nameOf={() => t('rpShell.mn_someone')} onClose={() => { setOpenId(null); void refresh(); }} />
      </div>
    );
  }

  const card = (m: MissionHeader, accent?: 'overdue') => (
    <button key={m.id} onClick={() => setOpenId(m.id)}
      className={`flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-start shadow-sm transition active:scale-[0.99] ${accent === 'overdue' ? 'border-red-200' : 'hover:border-primary/40'}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${m.status === 'in_progress' ? 'bg-amber-100 text-amber-600' : m.status === 'completed' || m.status === 'reviewed' ? 'bg-emerald-100 text-emerald-600' : 'bg-primary/10 text-primary'}`}>
        {m.status === 'in_progress' ? <Play className="h-5 w-5" /> : m.status === 'completed' || m.status === 'reviewed' ? <CheckCircle2 className="h-5 w-5" /> : <Target className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{m.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {t('rpShell.mn_stops', { n: m.stopCount })}</span>
          {m.missionDate && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {m.missionDate}</span>}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[m.status]}`}>{t(`rpShell.ms_${m.status}` as Parameters<typeof t>[0])}</span>
      <Chevron className="h-5 w-5 shrink-0 text-muted-foreground/50" />
    </button>
  );

  const section = (title: string, icon: React.ReactNode, items: MissionHeader[], accent?: 'overdue') => items.length > 0 && (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 px-1 text-sm font-bold">{icon} {title} <span className="text-muted-foreground">({items.length})</span></p>
      {items.map((m) => card(m, accent))}
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-5 p-1">
      <div className="px-1">
        <h1 className="text-2xl font-bold">{t('rpShell.sx_title')}</h1>
        <p className="text-sm text-muted-foreground">{t('rpShell.sx_lead')}</p>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{t('rpShell.mn_loading')}</p>
      ) : missions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-10 text-center">
          <Target className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-lg font-semibold">{t('rpShell.sx_empty')}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{t('rpShell.sx_emptyLead')}</p>
        </div>
      ) : (
        <>
          {section(t('rpShell.sx_today'), <Clock className="h-4 w-4 text-sky-600" />, b.today)}
          {section(t('rpShell.kpi_overdue'), <AlertTriangle className="h-4 w-4 text-red-600" />, b.overdue, 'overdue')}
          {section(t('rpShell.sx_upcoming'), <Calendar className="h-4 w-4 text-muted-foreground" />, b.upcoming)}
          {section(t('rpShell.sx_done'), <CheckCircle2 className="h-4 w-4 text-emerald-600" />, b.done.slice(0, 10))}
        </>
      )}
    </div>
  );
}
