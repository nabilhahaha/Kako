'use client';

import { useEffect, useMemo, useState } from 'react';
import { Target, Plus, MapPin, Users, Wand2, Check, ArrowRight, ArrowLeft, Calendar, Search, X, Send, Trash2, ClipboardList, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import { sequenceStops, type JourneyPoint } from '@/lib/tis/journey';
import type { MissionPerms } from '@/lib/erp/route-planner-access';
import type { MissionStatus } from '@/lib/erp/route-planner-mission';
import { SelectionMap, type SelMapPoint } from './selection-map';
import { createMission, listMissions, listAssignableUsers, deleteMission, type MissionHeader } from './rp-mission-actions';

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
  const [missions, setMissions] = useState<MissionHeader[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [m, u] = await Promise.all([listMissions('all'), listAssignableUsers()]);
    if (m.ok) setMissions(m.data ?? []);
    if (u.ok) setPeople(u.data ?? []);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);
  const nameOf = useMemo(() => { const map = new Map(people.map((p) => [p.id, p.name])); return (id: string | null) => (id ? map.get(id) ?? t('rpShell.mn_someone') : t('rpShell.mn_unassigned')); }, [people, t]);

  if (mode === 'build') {
    return <MissionBuilder customers={customers} people={people} perms={perms} onImport={onImport}
      onCancel={() => setMode('list')} onSaved={() => { setMode('list'); void refresh(); }} />;
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
        {perms.canCreate && (
          <Button onClick={() => setMode('build')}><Plus className="h-4 w-4" /> {t('rpShell.mn_new')}</Button>
        )}
      </div>
      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{msg}</p>}

      {loading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t('rpShell.mn_loading')}</p>
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
                  <li key={m.id} className="rounded-xl border bg-card p-3 shadow-sm transition hover:shadow">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">{m.name}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[m.status]}`}>{t(`rpShell.ms_${m.status}` as Parameters<typeof t>[0])}</span>
                    </div>
                    <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                      <p className="flex items-center gap-1"><Users className="h-3 w-3" /> {nameOf(m.assignedTo)}</p>
                      <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {t('rpShell.mn_stops', { n: m.stopCount })}</p>
                      {m.missionDate && <p className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {m.missionDate}</p>}
                    </div>
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

// ── The guided builder ──────────────────────────────────────────────────────
function MissionBuilder({ customers, people, perms, onCancel, onSaved, onImport }: {
  customers: DpCustomer[]; people: { id: string; name: string }[]; perms: MissionPerms;
  onCancel: () => void; onSaved: () => void; onImport: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [supervisorId, setSupervisorId] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    </div>
  );
}
