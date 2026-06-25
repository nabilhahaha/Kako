'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Route, RefreshCw, Loader2, ChevronLeft, MapPin, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { getMyMissions } from './rp-mission-exec-actions';
import { missionTone, type MissionRunRow, type StatusTone } from './rp-mission-exec';

const TONE_BADGE: Record<StatusTone, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  slate: 'bg-slate-100 text-slate-700',
};
const TONE_BAR: Record<StatusTone, string> = {
  green: 'bg-emerald-500', blue: 'bg-blue-500', amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-slate-400',
};

/**
 * PR-4 — the rep's "My Missions" launcher (mobile-first). Lists the missions assigned to
 * the signed-in rep with live progress, linking each into the Mission Runner. Read-only;
 * all execution writes happen in the runner (server-validated, RLS-backed).
 */
export function MyMissions() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<MissionRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMyMissions();
    setRows(res.ok ? res.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/distribution/route-planner" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('rpMissions.back')}>
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Route className="h-5 w-5 text-blue-600" /> {t('rpMissions.title')}
            </h1>
            <p className="text-sm text-slate-500">{t('rpMissions.subtitle')}</p>
          </div>
        </div>
        <button onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label={t('rpMissions.refresh')}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="font-medium text-slate-600">{t('rpMissions.empty')}</p>
          <p className="mt-1 text-sm text-slate-400">{t('rpMissions.emptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => {
            const tone = missionTone(m.status);
            return (
              <li key={m.id}>
                <Link href={`/distribution/route-planner/my-missions/${m.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{m.name}</p>
                      {m.missionDate && (
                        <p className="text-xs text-slate-500">{new Date(m.missionDate).toLocaleDateString(locale)}</p>
                      )}
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_BADGE[tone])}>
                      {t(`rpMissions.status_${m.status}`)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t('rpMissions.progress', { done: m.doneCount, total: m.stopCount })}
                      </span>
                      <span>{m.pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className={cn('h-full rounded-full transition-all', TONE_BAR[tone])} style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
