'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Loader2, RefreshCw, MapPin, Navigation, Check, SkipForward,
  Camera, X, Flag, CheckCircle2, PlayCircle, Image as ImageIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { uploadAttachment } from '@/app/(app)/attachments/actions';
import { FvMap } from './fv-map';
import { openGoogleMapsNavigation, canNavigate } from './fv-nav';
import {
  getMissionRun, startMission, checkInStop, completeStop, skipStop, completeMission,
} from './rp-mission-exec-actions';
import {
  runProgress, nextActionableStop, stopsToMapPoints, stopTone, missionTone, allStopsHandled,
  orderedStops, type MissionRunStop, type StatusTone, type MissionStatus,
} from './rp-mission-exec';

type Run = { id: string; name: string; missionDate: string | null; status: string; stops: MissionRunStop[] };
type Gps = { lat: number; lng: number } | null;

const TONE_BADGE: Record<StatusTone, string> = {
  green: 'bg-emerald-100 text-emerald-800', blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-800', slate: 'bg-slate-100 text-slate-700',
};
const TONE_DOT: Record<StatusTone, string> = {
  green: 'bg-emerald-500', blue: 'bg-blue-500', amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-slate-400',
};

/**
 * PR-4 — the Mission Runner (mobile-first). The assigned rep executes one mission:
 * start → per-stop check-in (with GPS) → notes/photos → mark done (or skip) → complete.
 * Every action is a server call (canExecuteMission + RLS enforced); the screen reloads the
 * mission after each so the state always matches the database. Read of FvMap is reused for
 * the route map (done = green, otherwise red). Field Verification is untouched.
 */
export function MissionRunner({ missionId }: { missionId: string }) {
  const { t, locale } = useI18n();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'stops' | 'map'>('stops');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gps, setGps] = useState<Gps>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getMissionRun(missionId);
    if (!res.ok) { setNotFound(true); setLoading(false); return; }
    setRun(res.data);
    setLoading(false);
  }, [missionId]);
  useEffect(() => { void load(); }, [load]);

  // Best-effort GPS (used at check-in; never blocks).
  const ensureGps = useCallback((): Promise<Gps> => new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { const g = { lat: p.coords.latitude, lng: p.coords.longitude }; setGps(g); resolve(g); },
      () => resolve(null), { enableHighAccuracy: true, timeout: 8000 },
    );
  }), []);

  const stops = run ? orderedStops(run.stops) : [];
  const progress = runProgress(stops);
  const next = nextActionableStop(stops);
  const selected = stops.find((s) => s.id === selectedId) ?? null;

  function openStop(s: MissionRunStop) {
    setSelectedId(s.id); setNote(s.notes ?? ''); setPhotoIds([]); setErr(null);
  }

  async function run_(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { setErr(t('rpMissions.err')); return false; }
    await load();
    return true;
  }

  async function onCheckIn(s: MissionRunStop) {
    const g = await ensureGps();
    await run_(() => checkInStop(missionId, s.id, g));
  }
  async function onMarkDone(s: MissionRunStop) {
    const ok = await run_(() => completeStop(missionId, s.id, { gps, notes: note, photoIds }));
    if (ok) { setSelectedId(null); setNote(''); setPhotoIds([]); }
  }
  async function onSkip(s: MissionRunStop) {
    const ok = await run_(() => skipStop(missionId, s.id, note));
    if (ok) { setSelectedId(null); setNote(''); }
  }

  async function onPhoto(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append('entity', 'route_ride'); fd.append('record_id', missionId); fd.append('file', file);
    const res = await uploadAttachment(fd);
    setUploading(false);
    if (res.ok && res.data?.id) setPhotoIds((prev) => [...prev, res.data!.id]);
    else setErr(t('rpMissions.err'));
  }

  if (loading) return <div className="flex justify-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (notFound || !run) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="font-medium text-slate-600">{t('rpMissions.notFound')}</p>
        <Link href="/distribution/route-planner/my-missions" className="mt-3 inline-block text-sm text-blue-600 hover:underline">{t('rpMissions.back')}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/distribution/route-planner/my-missions" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('rpMissions.back')}>
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{run.name}</h1>
            {run.missionDate && <p className="text-xs text-slate-500">{new Date(run.missionDate).toLocaleDateString(locale)}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_BADGE[missionTone(run.status as MissionStatus)])}>
            {t(`rpMissions.status_${run.status}`)}
          </span>
          <button onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label={t('rpMissions.refresh')}>
            <RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Progress + lifecycle */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">{t('rpMissions.progress', { done: progress.done, total: progress.total })}</span>
          <span className="text-slate-500">{progress.pct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress.pct}%` }} />
        </div>
        {run.status === 'assigned' && (
          <button disabled={busy} onClick={() => void run_(() => startMission(missionId))}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <PlayCircle className="h-4 w-4" /> {t('rpMissions.start')}
          </button>
        )}
        {run.status === 'in_progress' && allStopsHandled(stops) && (
          <div className="mt-3">
            <p className="mb-2 text-center text-sm text-emerald-700">{t('rpMissions.allDone')} — {t('rpMissions.completeHint')}</p>
            <button disabled={busy} onClick={() => void run_(() => completeMission(missionId))}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              <Flag className="h-4 w-4" /> {t('rpMissions.complete')}
            </button>
          </div>
        )}
        {run.status === 'completed' && (
          <p className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-50 py-2 font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {t('rpMissions.completed')}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
        {(['stops', 'map'] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)}
            className={cn('flex-1 rounded-md py-1.5 text-sm font-medium', tab === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
            {t(`rpMissions.tab_${tb}`)}
          </button>
        ))}
      </div>

      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {tab === 'map' ? (
        <div className="h-[60vh] overflow-hidden rounded-xl border border-slate-200">
          <FvMap points={stopsToMapPoints(stops)} gps={gps} locale={locale} t={t}
            onOpenCustomer={(p) => { setTab('stops'); const s = stops.find((x) => x.id === p.id); if (s) openStop(s); }} />
        </div>
      ) : stops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-slate-400">{t('rpMissions.noStops')}</div>
      ) : (
        <ul className="space-y-2">
          {stops.map((s) => {
            const tone = stopTone(s.status);
            const isNext = next?.id === s.id;
            const open = selectedId === s.id;
            return (
              <li key={s.id} className={cn('rounded-xl border bg-white', isNext ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200')}>
                <button onClick={() => (open ? setSelectedId(null) : openStop(s))} className="flex w-full items-center gap-3 p-3 text-start">
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', TONE_DOT[tone])}>{s.seq}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{s.customerName}</span>
                    {s.customerCode && <span className="block truncate text-xs text-slate-400">{s.customerCode}</span>}
                  </span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', TONE_BADGE[tone])}>{t(`rpMissions.stop_${s.status}`)}</span>
                </button>

                {open && s.status !== 'done' && s.status !== 'skipped' && (
                  <div className="space-y-3 border-t border-slate-100 p-3">
                    <div className="flex flex-wrap gap-2">
                      {s.status === 'pending' && (
                        <button disabled={busy} onClick={() => void onCheckIn(s)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                          <MapPin className="h-4 w-4" /> {t('rpMissions.checkIn')}
                        </button>
                      )}
                      {canNavigate(s.lat, s.lng) && (
                        <button onClick={() => openGoogleMapsNavigation(s.lat as number, s.lng as number)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          <Navigation className="h-4 w-4" /> {t('rpMissions.navigate')}
                        </button>
                      )}
                    </div>

                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                      placeholder={t('rpMissions.notesPlaceholder')}
                      className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />

                    <div className="flex flex-wrap items-center gap-2">
                      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPhoto(f); e.target.value = ''; }} />
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {t('rpMissions.takePhoto')}
                      </button>
                      {photoIds.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500"><ImageIcon className="h-3.5 w-3.5" /> {photoIds.length}</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button disabled={busy} onClick={() => void onMarkDone(s)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        <Check className="h-4 w-4" /> {t('rpMissions.markDone')}
                      </button>
                      <button disabled={busy} onClick={() => void onSkip(s)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        <SkipForward className="h-4 w-4" /> {t('rpMissions.skip')}
                      </button>
                    </div>
                  </div>
                )}

                {open && (s.status === 'done' || s.status === 'skipped') && (
                  <div className="border-t border-slate-100 p-3 text-sm text-slate-500">
                    {s.notes && <p className="flex items-start gap-1.5"><X className="mt-0.5 hidden h-4 w-4" />{s.notes}</p>}
                    {canNavigate(s.lat, s.lng) && (
                      <button onClick={() => openGoogleMapsNavigation(s.lat as number, s.lng as number)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                        <Navigation className="h-4 w-4" /> {t('rpMissions.navigate')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
