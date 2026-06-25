'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Loader2, Route, X, Users, ListChecks } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { FvMap } from './fv-map';
import { getMissionTracking, getMissionTrackingDetail, type TrackingEvent } from './rp-mission-tracking-actions';
import { trackingSummary, repRollup, missionTone, type TrackingRow } from './rp-mission-tracking';
import { stopsToMapPoints, stopTone, type MissionRunStop, type StatusTone } from './rp-mission-exec';

const BADGE: Record<StatusTone, string> = {
  green: 'bg-emerald-100 text-emerald-800', blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', slate: 'bg-slate-100 text-slate-700',
};
const BAR: Record<StatusTone, string> = {
  green: 'bg-emerald-500', blue: 'bg-blue-500', amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-slate-400',
};

function Kpi({ label, value, tone = 'slate' }: { label: string; value: string | number; tone?: StatusTone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('mt-0.5 text-xl font-bold',
        tone === 'green' ? 'text-emerald-600' : tone === 'blue' ? 'text-blue-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-900')}>{value}</p>
    </div>
  );
}

/**
 * PR-6 — supervisor / admin mission tracking (read-only). KPI summary + a missions table and
 * a per-rep rollup; clicking a mission opens a detail drawer with the route map, stop
 * statuses and the activity feed. Visibility is RLS-scoped (team for supervisors, company for
 * admins). No writes; Field Verification untouched.
 */
export function MissionTracking() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'missions' | 'reps'>('missions');
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMissionTracking();
    setRows(res.ok ? res.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const summary = trackingSummary(rows);
  const reps = repRollup(rows);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/distribution/route-planner" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('rpTracking.back')}>
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Route className="h-5 w-5 text-blue-600" /> {t('rpTracking.title')}</h1>
            <p className="text-sm text-slate-500">{t('rpTracking.subtitle')}</p>
          </div>
        </div>
        <button onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label={t('rpTracking.refresh')}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t('rpTracking.kpiMissions')} value={summary.missions} />
        <Kpi label={t('rpTracking.kpiActive')} value={summary.activeMissions} tone="blue" />
        <Kpi label={t('rpTracking.kpiCompleted')} value={summary.completedMissions} tone="green" />
        <Kpi label={t('rpTracking.kpiStops')} value={summary.totalStops} />
        <Kpi label={t('rpTracking.kpiDone')} value={summary.doneStops} tone="green" />
        <Kpi label={t('rpTracking.kpiCoverage')} value={`${summary.pct}%`} tone="amber" />
      </div>

      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-72">
        {(['missions', 'reps'] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={cn('flex-1 inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium', tab === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
            {tb === 'missions' ? <ListChecks className="h-4 w-4" /> : <Users className="h-4 w-4" />} {t(`rpTracking.tab_${tb}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-slate-400">{t('rpTracking.empty')}</div>
      ) : tab === 'missions' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('rpTracking.colMission')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('rpTracking.colRep')}</th>
                <th className="hidden px-3 py-2 text-start font-medium sm:table-cell">{t('rpTracking.colStatus')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('rpTracking.colProgress')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const tone = missionTone(r.status);
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className="block font-medium text-slate-800">{r.name}</span>
                      {r.missionDate && <span className="block text-xs text-slate-400">{new Date(r.missionDate).toLocaleDateString(locale)}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.assigneeName ?? t('rpTracking.unassigned')}</td>
                    <td className="hidden px-3 py-2 sm:table-cell"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', BADGE[tone])}>{t(`rpMissions.status_${r.status}`)}</span></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full rounded-full', BAR[tone])} style={{ width: `${r.pct}%` }} /></div>
                        <span className="text-xs text-slate-500">{r.done}/{r.total}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('rpTracking.colRep')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('rpTracking.kpiMissions')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('rpTracking.colProgress')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reps.map((rp) => (
                <tr key={rp.assigneeId ?? '∅'}>
                  <td className="px-3 py-2 font-medium text-slate-800">{rp.name}</td>
                  <td className="px-3 py-2 text-slate-600">{t('rpTracking.repMissions', { n: rp.missions })}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${rp.pct}%` }} /></div>
                      <span className="text-xs text-slate-500">{rp.doneStops}/{rp.totalStops}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && <TrackingDetail missionId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function TrackingDetail({ missionId, onClose }: { missionId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<{ name: string; status: string; stops: MissionRunStop[]; events: TrackingEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stops' | 'map' | 'activity'>('stops');

  useEffect(() => {
    void (async () => { const res = await getMissionTrackingDetail(missionId); setData(res.ok ? res.data : null); setLoading(false); })();
  }, [missionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{data?.name ?? t('rpTracking.detail')}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label={t('rpTracking.close')}><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
          {([['stops', t('rpTracking.tab_stops')], ['map', t('rpTracking.tab_map')], ['activity', t('rpTracking.activity')]] as const).map(([tb, label]) => (
            <button key={tb} onClick={() => setTab(tb)} className={cn('flex-1 rounded-md py-1.5 text-sm font-medium', tab === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
              {label}
            </button>
          ))}
        </div>
        {loading || !data ? (
          <div className="flex justify-center py-12 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : tab === 'map' ? (
          <div className="h-[55vh] overflow-hidden rounded-lg border border-slate-200">
            <FvMap points={stopsToMapPoints(data.stops)} gps={null} locale={locale} t={t} onOpenCustomer={() => {}} />
          </div>
        ) : tab === 'stops' ? (
          <ul className="space-y-1.5">
            {data.stops.map((s) => {
              const tone = stopTone(s.status);
              return (
                <li key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2 py-1.5">
                  <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white', BAR[tone])}>{s.seq}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{s.customerName}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', BADGE[tone])}>{t(`rpMissions.stop_${s.status}`)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="space-y-1">
            {data.events.length === 0 ? <li className="py-8 text-center text-sm text-slate-400">{t('rpTracking.noEvents')}</li> :
              data.events.map((e, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="text-slate-700">{e.kind}</span>
                  <span className="text-xs text-slate-400">{e.at ? new Date(e.at).toLocaleString(locale) : ''}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
