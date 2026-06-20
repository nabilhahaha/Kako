'use client';

import { useEffect, useMemo, useState } from 'react';
import { Target, Plus, MapPin, Users, Wand2, Check, ArrowRight, ArrowLeft, Calendar, Search, X, Send, Trash2, ChevronRight, Play, LogIn, LogOut, Camera, MessageSquare, AlertTriangle, Swords, Lightbulb, ListChecks, Flag, CheckCircle2, Navigation, Image as ImageIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import { sequenceStops, type JourneyPoint } from '@/lib/tis/journey';
import type { MissionPerms } from '@/lib/erp/route-planner-access';
import { missionProgress, type MissionStatus, type StopObservationKind } from '@/lib/erp/route-planner-mission';
import { SelectionMap, type SelMapPoint } from './selection-map';
import {
  createMission, listMissions, listAssignableUsers, deleteMission, getMission, transitionMission,
  checkInStop, checkOutStop, addStopObservation, createMissionFromDayPlan, createMissionFromJourneyDay, type MissionHeader,
} from './rp-mission-actions';
import { listDayPlans, listJourneyPlans, type SavedPlanRow } from './rp-plan-actions';
import { loadSegments, syncSegments, filterBySegment, type RpSegment } from './route-planner-segments';
import { JOURNEY_DAYS, type JourneyDayKey } from '@/lib/erp/route-planner-daily-plan';
import { uploadAttachment, listAttachments, type AttachmentView } from '@/app/(app)/attachments/actions';

const STATUS_TONE: Record<MissionStatus, string> = {
  draft: 'bg-slate-100 text-slate-700', assigned: 'bg-sky-100 text-sky-700', in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700', reviewed: 'bg-violet-100 text-violet-700', archived: 'bg-muted text-muted-foreground',
};

/**
 * Supervisor Missions — manager builder + list (premium UX). A guided 3-step flow:
 * Who (pick a supervisor) → Where (pick customers from the active dataset) → Sequence
 * (review on the map, optimize the order) → save & assign. Mobile-friendly; clear primary
 * actions; useful empty states. Reuses the journey nearest-neighbour sequencer + the
 * shared SelectionMap. Backend enforces capability; the UI hides what you can't do.
 */
export function MissionsView({ customers, perms, onImport }: { customers: DpCustomer[]; perms: MissionPerms; onImport: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'list' | 'build'>('list');
  const [scope, setScope] = useState<'all' | 'assigned'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionHeader[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [m, u] = await Promise.all([listMissions(scope), listAssignableUsers()]);
    if (m.ok) setMissions(m.data ?? []);
    if (u.ok) setPeople(u.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, [scope]);
  const nameOf = useMemo(() => { const map = new Map(people.map((p) => [p.id, p.name])); return (id: string | null) => (id ? map.get(id) ?? t('rpShell.mn_someone') : t('rpShell.mn_unassigned')); }, [people, t]);

  if (mode === 'build') {
    return <MissionBuilder customers={customers} people={people} perms={perms} onImport={onImport}
      onCancel={() => setMode('list')} onSaved={() => { setMode('list'); void refresh(); }} />;
  }
  if (openId) {
    return <MissionDetail missionId={openId} perms={perms} nameOf={(id) => nameOf(id)} onClose={() => { setOpenId(null); void refresh(); }} />;
  }

  const grouped = useMemo(() => {
    const order: MissionStatus[] = ['in_progress', 'assigned', 'draft', 'completed', 'reviewed', 'archived'];
    return order.map((s) => ({ status: s, items: missions.filter((m) => m.status === s) })).filter((g) => g.items.length > 0);
  }, [missions]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <p className="text-sm font-bold">{t('rpShell.mn_title')}</p>
          {missions.length > 0 && <span className="text-xs text-muted-foreground">({missions.length})</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full border text-xs">
            {(['all', 'assigned'] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className={`px-3 py-1 ${scope === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                {s === 'all' ? t('rpShell.mn_scopeAll') : t('rpShell.mn_scopeMine')}
              </button>
            ))}
          </div>
          {perms.canCreate && (
            <Button onClick={() => setMode('build')}><Plus className="h-4 w-4" /> {t('rpShell.mn_new')}</Button>
          )}
        </div>
      </div>
      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{msg}</p>}

      {loading ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="space-y-1.5"><div className="h-3 w-1/2 animate-pulse rounded bg-muted/60" /><div className="h-3 w-1/3 animate-pulse rounded bg-muted/60" /></div>
            </li>
          ))}
        </ul>
      ) : missions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-8 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-lg font-semibold">{t('rpShell.mn_emptyTitle')}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{perms.canCreate ? t('rpShell.mn_emptyLead') : t('rpShell.mn_emptyLeadExec')}</p>
          {perms.canCreate && <Button onClick={() => setMode('build')}><Plus className="h-4 w-4" /> {t('rpShell.mn_new')}</Button>}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          {grouped.map((g) => (
            <div key={g.status}>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[g.status]}`}>{t(`rpShell.ms_${g.status}` as Parameters<typeof t>[0])}</span>
                <span>{g.items.length}</span>
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((m) => (
                  <li key={m.id} className="rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow">
                    <button onClick={() => setOpenId(m.id)} className="block w-full text-start">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 truncate font-medium">{m.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[m.status]}`}>{t(`rpShell.ms_${m.status}` as Parameters<typeof t>[0])}</span>
                      </div>
                      <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                        <p className="flex items-center gap-1"><Users className="h-3 w-3" /> {nameOf(m.assignedTo)}</p>
                        <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {t('rpShell.mn_stops', { n: m.stopCount })}</p>
                        {m.missionDate && <p className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {m.missionDate}</p>}
                      </div>
                    </button>
                    {(m.status === 'draft') && perms.canCreate && (
                      <button onClick={async () => { await deleteMission(m.id); void refresh(); }} className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-600">
                        <Trash2 className="h-3 w-3" /> {t('rpShell.mn_delete')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mobile execution: My Mission detail ─────────────────────────────────────
const ATTACH_ENTITY = 'rp_mission';

interface StopRow { id: string; seq: number; customer_name: string; customer_code: string | null; status: string; lat: number | null; lng: number | null; follow_up: boolean }

function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 6000 },
    );
  });
}

const OBS: { kind: StopObservationKind; icon: typeof MessageSquare; key: string }[] = [
  { kind: 'note', icon: MessageSquare, key: 'mn_obsNote' },
  { kind: 'issue', icon: AlertTriangle, key: 'mn_obsIssue' },
  { kind: 'competitor', icon: Swords, key: 'mn_obsCompetitor' },
  { kind: 'opportunity', icon: Lightbulb, key: 'mn_obsOpportunity' },
  { kind: 'follow_up', icon: ListChecks, key: 'mn_obsFollowUp' },
];

export function MissionDetail({ missionId, perms, nameOf, onClose }: {
  missionId: string; perms: MissionPerms; nameOf: (id: string | null) => string; onClose: () => void;
}) {
  const { t } = useI18n();
  const [header, setHeader] = useState<MissionHeader | null>(null);
  const [stops, setStops] = useState<StopRow[]>([]);
  const [report, setReport] = useState<ReturnType<typeof import('@/lib/erp/route-planner-mission')['missionReport']> | null>(null);
  const [busy, setBusy] = useState(false);
  const [composer, setComposer] = useState<{ stopId: string; kind: StopObservationKind } | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<AttachmentView[]>([]);
  async function load() {
    const r = await getMission(missionId);
    if (r.ok && r.data) { setHeader(r.data.header); setStops(r.data.stops as unknown as StopRow[]); setReport(r.data.report); }
  }
  async function loadPhotos() {
    try { const a = await listAttachments(ATTACH_ENTITY, missionId); setPhotos(a.filter((x) => (x.mime_type ?? '').startsWith('image/') && x.url)); } catch { /* ignore */ }
  }
  useEffect(() => { void load(); void loadPhotos(); }, [missionId]);

  const progress = useMemo(() => missionProgress(stops), [stops]);
  const status = header?.status;
  const running = status === 'in_progress';

  async function doTransition(to: MissionStatus) { setBusy(true); await transitionMission(missionId, to); await load(); setBusy(false); }
  async function doCheckIn(stopId: string) { setBusy(true); const gps = await getGps(); await checkInStop(stopId, gps ?? undefined); await load(); setBusy(false); }
  async function doCheckOut(stopId: string, done: boolean) { setBusy(true); await checkOutStop(stopId, done); await load(); setBusy(false); }
  async function sendObs() {
    if (!composer) return;
    setBusy(true);
    await addStopObservation({ missionId, stopId: composer.stopId, kind: composer.kind, text: text.trim() || null });
    setComposer(null); setText(''); await load(); setBusy(false);
  }
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>, stopId: string) {
    const file = e.target.files?.[0]; if (e.target) e.target.value = '';
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append('entity', ATTACH_ENTITY); fd.append('record_id', missionId); fd.append('file', file);
    const up = await uploadAttachment(fd);
    await addStopObservation({ missionId, stopId, kind: 'photo', text: file.name, attachments: up && typeof up === 'object' && 'id' in up ? [String((up as { id: unknown }).id)] : [] });
    await load(); await loadPhotos(); setBusy(false);
  }

  if (!header) return <p className="p-6 text-center text-sm text-muted-foreground">{t('rpShell.mn_loading')}</p>;

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-2xl flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold">{header.name}</p>
          <p className="text-[11px] text-muted-foreground"><Users className="me-1 inline h-3 w-3" />{nameOf(header.assignedTo)}{header.missionDate ? ` · ${header.missionDate}` : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_TONE[header.status]}`}>{t(`rpShell.ms_${header.status}` as Parameters<typeof t>[0])}</span>
      </div>

      {/* Progress */}
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{t('rpShell.mn_progress', { done: progress.visited, total: progress.total })}</span><span>{progress.pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} /></div>
      </div>

      {/* Primary lifecycle action */}
      {status === 'assigned' && perms.canExecute && (
        <Button size="lg" disabled={busy} onClick={() => doTransition('in_progress')}><Play className="h-4 w-4" /> {t('rpShell.mn_start')}</Button>
      )}
      {running && (
        <Button size="lg" disabled={busy || progress.total === 0} onClick={() => doTransition('completed')}><CheckCircle2 className="h-4 w-4" /> {t('rpShell.mn_complete')}</Button>
      )}
      {status === 'completed' && perms.canReview && (
        <Button size="lg" variant="outline" disabled={busy} onClick={() => doTransition('reviewed')}><Check className="h-4 w-4" /> {t('rpShell.mn_markReviewed')}</Button>
      )}

      {/* Report (completed / reviewed) */}
      {report && (status === 'completed' || status === 'reviewed') && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/20 p-3 text-center">
          {[
            { v: report.stopsCompleted, k: 'mn_rCompleted' }, { v: report.stopsMissed, k: 'mn_rMissed' }, { v: report.stopsSkipped, k: 'mn_rSkipped' },
            { v: report.issues, k: 'mn_obsIssue' }, { v: report.opportunities, k: 'mn_obsOpportunity' }, { v: report.followUps, k: 'mn_obsFollowUp' },
          ].map((x) => (
            <div key={x.k}><p className="text-lg font-bold tabular-nums">{x.v}</p><p className="text-[10px] text-muted-foreground">{t(`rpShell.${x.k}` as Parameters<typeof t>[0])}</p></div>
          ))}
        </div>
      )}

      {/* Mission photos — evidence captured during execution (shared erp_attachments). */}
      {photos.length > 0 && (status === 'completed' || status === 'reviewed' || running) && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" /> {t('rpShell.mn_obsPhoto')} · {photos.length}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p) => (
              <a key={p.id} href={p.url ?? '#'} target="_blank" rel="noreferrer" className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url ?? ''} alt={p.file_name} className="h-full w-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Ordered stops */}
      <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
        {stops.map((s) => (
          <li key={s.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${s.status === 'done' ? 'bg-emerald-100 text-emerald-700' : s.status === 'skipped' ? 'bg-muted text-muted-foreground' : s.status === 'checked_in' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}>
                {s.status === 'done' ? <Check className="h-3.5 w-3.5" /> : s.seq + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.customer_name}</p>
                {s.customer_code && <p className="text-[11px] text-muted-foreground">{s.customer_code}</p>}
              </div>
              {Number.isFinite(s.lat) && Number.isFinite(s.lng) && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="rounded-lg border p-1.5 hover:bg-muted" title={t('rpShell.mn_navigate')}><Navigation className="h-4 w-4 text-primary" /></a>
              )}
            </div>

            {running && (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.status === 'pending' && <button disabled={busy} onClick={() => doCheckIn(s.id)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"><LogIn className="h-3.5 w-3.5" /> {t('rpShell.mn_checkIn')}</button>}
                  {s.status === 'checked_in' && <>
                    <button disabled={busy} onClick={() => doCheckOut(s.id, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"><LogOut className="h-3.5 w-3.5" /> {t('rpShell.mn_checkOut')}</button>
                    <button disabled={busy} onClick={() => doCheckOut(s.id, false)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">{t('rpShell.mn_skip')}</button>
                  </>}
                </div>
                {/* Observation quick-actions */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {OBS.map((o) => (
                    <button key={o.kind} onClick={() => { setComposer({ stopId: s.id, kind: o.kind }); setText(''); }} title={t(`rpShell.${o.key}` as Parameters<typeof t>[0])}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"><o.icon className="h-3 w-3" /> {t(`rpShell.${o.key}` as Parameters<typeof t>[0])}</button>
                  ))}
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
                    <Camera className="h-3 w-3" /> {t('rpShell.mn_obsPhoto')}
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e, s.id)} />
                  </label>
                </div>
                {s.follow_up && <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-700"><Flag className="h-3 w-3" /> {t('rpShell.mn_followFlagged')}</p>}
                {composer?.stopId === s.id && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t(`rpShell.${OBS.find((o) => o.kind === composer.kind)!.key}` as Parameters<typeof t>[0])} className="h-8 flex-1 text-xs" />
                    <Button size="sm" disabled={busy} onClick={() => void sendObs()}><Send className="h-4 w-4" /></Button>
                    <button onClick={() => setComposer(null)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {stops.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{t('rpShell.mn_noStops')}</p>}
      </ul>
    </div>
  );
}

// ── The guided builder ──────────────────────────────────────────────────────
function MissionBuilder({ customers, people, perms, onCancel, onSaved, onImport }: {
  customers: DpCustomer[]; people: { id: string; name: string }[]; perms: MissionPerms;
  onCancel: () => void; onSaved: () => void; onImport: () => void;
}) {
  const { t } = useI18n();
  const [source, setSource] = useState<'manual' | 'day_plan' | 'journey' | 'segment'>('manual');
  const [segments, setSegments] = useState<RpSegment[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Plan-sourced creation (Wave F connect): a Day/Journey plan becomes the mission.
  const [dayPlans, setDayPlans] = useState<SavedPlanRow[]>([]);
  const [journeyPlans, setJourneyPlans] = useState<SavedPlanRow[]>([]);
  const [planId, setPlanId] = useState<string>('');
  const [journeyDay, setJourneyDay] = useState<JourneyDayKey>('sat');
  useEffect(() => {
    void listDayPlans().then((r) => { if (r.ok) setDayPlans(r.data ?? []); });
    void listJourneyPlans().then((r) => { if (r.ok) setJourneyPlans(r.data ?? []); });
    setSegments(loadSegments()); void syncSegments().then(setSegments);
  }, []);
  // Saved segment → mission: apply the segment's filter to the active dataset to preselect
  // its customers, then drop into the manual sequence/save flow (reuses filterBySegment).
  function applySegment(seg: RpSegment) {
    const ids = filterBySegment(withGeo, seg.filter).map((c) => c.id);
    setSelected(new Set(ids)); setOrder([]); setName(seg.name); setSource('manual'); setStep(3);
    setTimeout(() => optimize(), 0);
  }
  async function createFromPlan() {
    setSaving(true); setMsg(null);
    const res = source === 'day_plan'
      ? await createMissionFromDayPlan(planId, { assignedTo: supervisorId || null, missionDate: date })
      : await createMissionFromJourneyDay(planId, journeyDay, { assignedTo: supervisorId || null, missionDate: date });
    setSaving(false);
    if (!res.ok) { setMsg(errLabel(res.error)); return; }
    onSaved();
  }

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const withGeo = useMemo(() => customers.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0)), [customers]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? withGeo.filter((c) => c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q)) : withGeo;
  }, [withGeo, search]);

  const orderedSelected = useMemo(() => {
    const ids = order.length ? order : [...selected];
    return ids.map((id) => byId.get(id)).filter((c): c is DpCustomer => !!c);
  }, [order, selected, byId]);

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setOrder([]);
  }
  function optimize() {
    const members = [...selected].map((id) => byId.get(id)).filter((c): c is DpCustomer => !!c).map((c) => ({ id: c.id, lat: c.lat, lng: c.lng }));
    if (members.length < 2) { setOrder([...selected]); return; }
    const start: JourneyPoint = { lat: members[0].lat, lng: members[0].lng };
    setOrder(sequenceStops(members, start, start));
  }

  const points: SelMapPoint[] = useMemo(() => withGeo.map((c) => ({
    id: c.id, name: c.name, lat: c.lat, lng: c.lng, color: selected.has(c.id) ? '#2563eb' : '#cbd5e1', dim: !selected.has(c.id),
  })), [withGeo, selected]);

  async function save(assign: boolean) {
    if (orderedSelected.length === 0) { setMsg(t('rpShell.mn_needStops')); return; }
    setSaving(true); setMsg(null);
    const res = await createMission({
      name: name.trim() || t('rpShell.mn_defaultName'), missionDate: date,
      assignedTo: assign && supervisorId ? supervisorId : null,
      stops: orderedSelected.map((c, i) => ({ customerCode: c.code, customerName: c.name, lat: c.lat, lng: c.lng, seq: i })),
    });
    setSaving(false);
    if (!res.ok) { setMsg(errLabel(res.error)); return; }
    onSaved();
  }
  function errLabel(code: string) {
    const m: Record<string, string> = {
      err_no_create_perm: t('rpShell.mn_errNoCreate'), err_no_assign_perm: t('rpShell.mn_errNoAssign'),
      err_name_required: t('rpShell.mn_errName'), err_unauthorized: t('rpShell.rg_errAuth'),
    };
    return m[code] ?? code;
  }

  if (withGeo.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <MapPin className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-lg font-semibold">{t('rpShell.mn_noData')}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t('rpShell.mn_noDataLead')}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}><ArrowLeft className="h-4 w-4" /> {t('routePlanner.cancel')}</Button>
          <Button onClick={onImport}><ArrowRight className="h-4 w-4" /> {t('rpShell.i_importCustomers')}</Button>
        </div>
      </div>
    );
  }

  const steps = [
    { n: 1 as const, label: t('rpShell.mn_step1') },
    { n: 2 as const, label: t('rpShell.mn_step2') },
    { n: 3 as const, label: t('rpShell.mn_step3') },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      {/* Header + step indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><p className="text-sm font-bold">{t('rpShell.mn_new')}</p></div>
        <button onClick={onCancel} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /> {t('routePlanner.cancel')}</button>
      </div>

      {/* Start-from source — a mission is the EXECUTION of a plan. Reuse planning outputs. */}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{t('rpShell.mn_startFrom')}</p>
        <div className="flex flex-wrap gap-1.5">
          {([['manual', 'mn_srcManual'], ['day_plan', 'mn_srcDayPlan'], ['journey', 'mn_srcJourney'], ['segment', 'mn_srcSegment']] as const).map(([s, key]) => (
            <button key={s} onClick={() => { setSource(s); setPlanId(''); setMsg(null); }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${source === s ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              {t(`rpShell.${key}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>
      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{msg}</p>}

      {/* Segment-sourced: pick a saved segment → preselect its customers → manual sequence. */}
      {source === 'segment' && (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          <p className="text-[11px] font-medium text-muted-foreground">{t('rpShell.mn_pickSegment')}</p>
          {segments.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('rpShell.mn_noSegments')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {segments.map((s) => {
                const count = filterBySegment(withGeo, s.filter).length;
                return (
                  <li key={s.id}>
                    <button onClick={() => applySegment(s)} className="flex w-full items-center gap-2 rounded-xl border p-3 text-start transition hover:border-primary hover:bg-muted">
                      <Search className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{t('rpShell.mn_selected', { n: count })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Plan-sourced flow: pick a saved Day/Journey plan + supervisor → create. */}
      {(source === 'day_plan' || source === 'journey') && (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          {source === 'journey' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">{t('rpShell.mn_pickDay')}</span>
              {JOURNEY_DAYS.map((d) => (
                <button key={d} onClick={() => setJourneyDay(d)} className={`rounded-full border px-2.5 py-1 text-[11px] ${journeyDay === d ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}>{t(`routePlanner.jpDay_${d}` as Parameters<typeof t>[0])}</button>
              ))}
            </div>
          )}
          <p className="text-[11px] font-medium text-muted-foreground">{source === 'day_plan' ? t('rpShell.mn_pickDayPlan') : t('rpShell.mn_pickJourney')}</p>
          {(source === 'day_plan' ? dayPlans : journeyPlans).length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('rpShell.mn_noPlans')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {(source === 'day_plan' ? dayPlans : journeyPlans).map((p) => (
                <li key={p.id}>
                  <button onClick={() => setPlanId(p.id)} className={`flex w-full items-center gap-2 rounded-xl border p-3 text-start transition ${planId === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'}`}>
                    <Target className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    {planId === p.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Supervisor + date + create */}
          {people.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t('rpShell.mn_step1')}</p>
              <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm sm:max-w-xs">
                <option value="">{t('rpShell.mn_unassigned')}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm sm:max-w-xs" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!planId || saving} onClick={() => void createFromPlan()}>{t('rpShell.mn_saveDraft')}</Button>
            {perms.canAssign && supervisorId && (
              <Button disabled={!planId || saving} onClick={() => void createFromPlan()}><Send className="h-4 w-4" /> {t('rpShell.mn_assign')}</Button>
            )}
          </div>
        </div>
      )}

      {/* Manual flow: the 3-step builder. */}
      {source === 'manual' && (<>
      <div className="flex items-center gap-1.5 text-[11px]">
        {steps.map((s, i) => (
          <span key={s.n} className="inline-flex items-center gap-1.5">
            <button onClick={() => (s.n < step ? setStep(s.n) : undefined)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium ${step === s.n ? 'border-primary bg-primary text-primary-foreground' : step > s.n ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-muted bg-muted/40 text-muted-foreground'}`}>
              {step > s.n ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{s.n}</span>} {s.label}
            </button>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
          </span>
        ))}
      </div>
      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{msg}</p>}

      {/* Step 1 — Who */}
      {step === 1 && (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          <p className="text-sm text-muted-foreground">{t('rpShell.mn_whoLead')}</p>
          {people.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('rpShell.mn_noPeople')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setSupervisorId(p.id)}
                    className={`flex w-full items-center gap-2 rounded-xl border p-3 text-start transition ${supervisorId === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'}`}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{p.name.slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    {supervisorId === p.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t('rpShell.mn_whoOptional')}</p>
          <div className="flex justify-end"><Button onClick={() => setStep(2)}>{t('rpShell.mn_next')} <ArrowRight className="h-4 w-4" /></Button></div>
        </div>
      )}

      {/* Step 2 — Where (pick customers) */}
      {step === 2 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1"><Search className="absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('rpShell.mn_searchCust')} className="h-8 ps-7 text-xs" /></div>
            <span className="text-xs font-medium text-primary">{t('rpShell.mn_selected', { n: selected.size })}</span>
            <button onClick={() => { setSelected(new Set(filtered.map((c) => c.id))); setOrder([]); }} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">{t('rpShell.mn_selectAll')}</button>
            {selected.size > 0 && <button onClick={() => { setSelected(new Set()); setOrder([]); }} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">{t('rpShell.mn_clear')}</button>}
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-auto rounded-lg border">
            {filtered.map((c) => (
              <li key={c.id}>
                <button onClick={() => toggle(c.id)} className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-muted/50">
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected.has(c.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>{selected.has(c.id) && <Check className="h-3 w-3" />}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  {c.code && <span className="shrink-0 text-[11px] text-muted-foreground">{c.code}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> {t('rpShell.mn_back')}</Button>
            <Button disabled={selected.size === 0} onClick={() => { optimize(); setStep(3); }}>{t('rpShell.mn_next')} <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Step 3 — Sequence + save */}
      {step === 3 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
          <div className="min-h-[240px] flex-1 overflow-hidden rounded-lg border">
            <SelectionMap points={points} hulls={[]} selectedIds={selected} focusIds={new Set()} routeOptions={[]} selectMode="pan" fill
              onToggle={toggle} onBoxSelect={() => {}} onMoveSingle={() => {}} onContextMenu={() => {}} onSelecting={() => {}} />
          </div>
          <div className="flex min-h-0 w-full flex-col gap-2 lg:w-80">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">{t('rpShell.mn_sequence')} · {orderedSelected.length}</p>
              <button onClick={optimize} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted"><Wand2 className="h-3 w-3" /> {t('rpShell.mn_optimize')}</button>
            </div>
            <ol className="min-h-0 flex-1 divide-y overflow-auto rounded-lg border text-xs">
              {orderedSelected.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </li>
              ))}
            </ol>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('rpShell.mn_namePh')} className="h-8 text-xs" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
            {supervisorId && <p className="text-[11px] text-muted-foreground"><Users className="me-1 inline h-3 w-3" />{(people.find((p) => p.id === supervisorId)?.name) ?? ''}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1"><ArrowLeft className="h-4 w-4" /> {t('rpShell.mn_back')}</Button>
              <Button variant="outline" disabled={saving} onClick={() => void save(false)} className="flex-1">{t('rpShell.mn_saveDraft')}</Button>
              {perms.canAssign && supervisorId && (
                <Button disabled={saving} onClick={() => void save(true)} className="flex-1"><Send className="h-4 w-4" /> {t('rpShell.mn_assign')}</Button>
              )}
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
