'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, MapPin, UserCheck, CalendarDays } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getMissionsBoard, type MissionRow } from './rp-missions-read-actions';
import { MISSION_STATUSES, type MissionStatus } from '@/lib/erp/route-planner-mission';

/**
 * Phase C2 — read-only supervisor missions board. Lists missions grouped by status
 * (the merged canonical list). No mutations: create/assign/update would touch the
 * mission_perms model and are deferred to a later reported phase.
 */
const STATUS_TINT: Record<MissionStatus, string> = {
  draft: 'border-slate-300 bg-slate-50',
  assigned: 'border-blue-300 bg-blue-50',
  in_progress: 'border-amber-300 bg-amber-50',
  completed: 'border-emerald-300 bg-emerald-50',
  reviewed: 'border-violet-300 bg-violet-50',
  archived: 'border-zinc-300 bg-zinc-50',
};

export function MissionsBoard() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<MissionRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await getMissionsBoard();
      if (res.ok) setRows(res.data);
      setLoaded(true);
    })();
  }, []);

  const byStatus = useMemo(() => {
    const m = Object.fromEntries(MISSION_STATUSES.map((s) => [s, [] as MissionRow[]])) as Record<MissionStatus, MissionRow[]>;
    for (const r of rows) (m[r.status] ?? (m[r.status] = [])).push(r);
    return m;
  }, [rows]);

  const dateFmt = (s: string | null) => (s ? new Date(s).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' }) : t('rpMiss.noDate'));

  if (!loaded) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpMiss.loading')}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">{t('rpMiss.title')}</p>
        <span className="text-[11px] text-muted-foreground">({rows.length})</span>
      </div>

      {rows.length === 0 && <p className="rounded-lg border px-3 py-6 text-center text-xs text-muted-foreground">{t('rpMiss.empty')}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {MISSION_STATUSES.map((s) => (
          <div key={s} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-2.5 py-1.5">
              <span className="text-[11px] font-bold">{t(`rpDash.ms_${s}` as 'rpDash.ms_draft')}</span>
              <span className="text-[11px] text-muted-foreground">{byStatus[s].length}</span>
            </div>
            <div className="space-y-1.5 p-2">
              {byStatus[s].length === 0 && <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">—</p>}
              {byStatus[s].map((m) => (
                <div key={m.id} className={`rounded border p-2 ${STATUS_TINT[s]}`}>
                  <p className="truncate text-xs font-semibold" title={m.name}>{m.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5"><CalendarDays className="h-3 w-3" />{dateFmt(m.missionDate)}</span>
                    <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{t('rpMiss.stops', { n: m.stopCount })}</span>
                    {m.assigned && <span className="inline-flex items-center gap-0.5 text-emerald-700"><UserCheck className="h-3 w-3" />{t('rpMiss.assigned')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">{t('rpMiss.readOnlyNote')}</p>
    </div>
  );
}
