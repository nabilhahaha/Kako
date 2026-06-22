'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, MapPin, UserCheck, CalendarDays, Plus, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getMissionsBoard, type MissionRow } from './rp-missions-read-actions';
import { getMyMissionWritePerms, listMissionAssignees, createMission, assignMission, transitionMissionStatus } from './rp-mission-write-actions';
import { MISSION_STATUSES, canTransition, type MissionStatus } from '@/lib/erp/route-planner-mission';
import type { MissionPerms } from '@/lib/erp/route-planner-access';

/**
 * Phase C2 (read) + D1b (write) — supervisor missions board. Lists missions grouped by
 * the canonical status. Write controls (create / assign / status) appear only when the
 * D1a default-restrictive access layer grants the capability; every action is re-checked
 * server-side and backed by DB RLS.
 */
const STATUS_TINT: Record<MissionStatus, string> = {
  draft: 'border-slate-300 bg-slate-50',
  assigned: 'border-blue-300 bg-blue-50',
  in_progress: 'border-amber-300 bg-amber-50',
  completed: 'border-emerald-300 bg-emerald-50',
  reviewed: 'border-violet-300 bg-violet-50',
  archived: 'border-zinc-300 bg-zinc-50',
};
const NO_PERMS: MissionPerms = { canCreate: false, canAssign: false, canExecute: false, canReview: false };

export function MissionsBoard() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<MissionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [perms, setPerms] = useState<MissionPerms>(NO_PERMS);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ name: string; date: string; assignTo: string }>({ name: '', date: '', assignTo: '' });

  async function refresh() {
    const res = await getMissionsBoard();
    if (res.ok) setRows(res.data);
    setLoaded(true);
  }
  useEffect(() => {
    void (async () => {
      await refresh();
      const p = await getMyMissionWritePerms();
      if (p.ok) {
        setPerms(p.data);
        if (p.data.canAssign) {
          const a = await listMissionAssignees();
          if (a.ok) setAssignees(a.data);
        }
      }
    })();
  }, []);

  const byStatus = useMemo(() => {
    const m = Object.fromEntries(MISSION_STATUSES.map((s) => [s, [] as MissionRow[]])) as Record<MissionStatus, MissionRow[]>;
    for (const r of rows) (m[r.status] ?? (m[r.status] = [])).push(r);
    return m;
  }, [rows]);

  const dateFmt = (s: string | null) => (s ? new Date(s).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' }) : t('rpMiss.noDate'));
  const canWrite = perms.canCreate || perms.canAssign || perms.canExecute || perms.canReview;

  async function onCreate() {
    if (!form.name.trim()) return;
    setBusy(true); setMsg(null);
    const res = await createMission({ name: form.name, missionDate: form.date || null, assignedTo: form.assignTo || null });
    setBusy(false);
    if (res.ok) { setForm({ name: '', date: '', assignTo: '' }); setShowCreate(false); setMsg({ tone: 'ok', text: t('rpMiss.created') }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpMiss.err') + ' ' + res.error });
  }
  async function onAssign(missionId: string, userId: string) {
    setBusy(true); setMsg(null);
    const res = await assignMission(missionId, userId || null);
    setBusy(false);
    if (res.ok) { setMsg({ tone: 'ok', text: t('rpMiss.assignedOk') }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpMiss.err') + ' ' + res.error });
  }
  async function onTransition(missionId: string, to: MissionStatus) {
    setBusy(true); setMsg(null);
    const res = await transitionMissionStatus(missionId, to);
    setBusy(false);
    if (res.ok) { setMsg({ tone: 'ok', text: t('rpMiss.statusOk') }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpMiss.err') + ' ' + res.error });
  }

  if (!loaded) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpMiss.loading')}</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">{t('rpMiss.title')}</p>
        <span className="text-[11px] text-muted-foreground">({rows.length})</span>
        <div className="flex-1" />
        {perms.canCreate && (
          <button onClick={() => setShowCreate((v) => !v)} disabled={busy}
            className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> {t('rpMiss.newMission')}
          </button>
        )}
      </div>

      {msg && <p className={`rounded-md border px-3 py-1.5 text-xs ${msg.tone === 'err' ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{msg.text}</p>}

      {showCreate && perms.canCreate && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
          <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            {t('rpMiss.fName')}
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border px-2 py-1 text-xs text-foreground" placeholder={t('rpMiss.fNamePh')} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            {t('rpMiss.fDate')}
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="rounded border px-2 py-1 text-xs text-foreground" />
          </label>
          {perms.canAssign && (
            <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
              {t('rpMiss.fAssign')}
              <select value={form.assignTo} onChange={(e) => setForm({ ...form, assignTo: e.target.value })} className="rounded border px-2 py-1 text-xs text-foreground">
                <option value="">{t('rpMiss.unassigned')}</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          <button onClick={() => void onCreate()} disabled={busy || !form.name.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{t('rpMiss.create')}</button>
          <button onClick={() => setShowCreate(false)} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs">{t('rpMiss.cancel')}</button>
        </div>
      )}

      {rows.length === 0 && !showCreate && <p className="rounded-lg border px-3 py-6 text-center text-xs text-muted-foreground">{t('rpMiss.empty')}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {MISSION_STATUSES.map((s) => (
          <div key={s} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-2.5 py-1.5">
              <span className="text-[11px] font-bold">{t(`rpDash.ms_${s}` as 'rpDash.ms_draft')}</span>
              <span className="text-[11px] text-muted-foreground">{byStatus[s].length}</span>
            </div>
            <div className="space-y-1.5 p-2">
              {byStatus[s].length === 0 && <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">—</p>}
              {byStatus[s].map((m) => {
                const nexts = canWrite ? MISSION_STATUSES.filter((x) => x !== s && canTransition(s, x)) : [];
                return (
                  <div key={m.id} className={`rounded border p-2 ${STATUS_TINT[s]}`}>
                    <p className="truncate text-xs font-semibold" title={m.name}>{m.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-0.5"><CalendarDays className="h-3 w-3" />{dateFmt(m.missionDate)}</span>
                      <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{t('rpMiss.stops', { n: m.stopCount })}</span>
                      {m.assigned && <span className="inline-flex items-center gap-0.5 text-emerald-700"><UserCheck className="h-3 w-3" />{t('rpMiss.assigned')}</span>}
                    </div>
                    {perms.canAssign && (
                      <select defaultValue="" disabled={busy} onChange={(e) => { if (e.target.value !== '__') void onAssign(m.id, e.target.value); }}
                        className="mt-1.5 w-full rounded border bg-background px-1.5 py-1 text-[10px]">
                        <option value="__">{t('rpMiss.reassign')}</option>
                        <option value="">{t('rpMiss.unassigned')}</option>
                        {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}
                    {nexts.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {nexts.map((to) => (
                          <button key={to} onClick={() => void onTransition(m.id, to)} disabled={busy}
                            className="inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium hover:bg-muted disabled:opacity-50">
                            <ChevronRight className="h-2.5 w-2.5" />{t(`rpDash.ms_${to}` as 'rpDash.ms_draft')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">{canWrite ? t('rpMiss.writeNote') : t('rpMiss.readOnlyNote')}</p>
    </div>
  );
}
