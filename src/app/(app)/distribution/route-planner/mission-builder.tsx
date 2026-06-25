'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Route, ChevronLeft, Search, Loader2, Plus, ArrowUp, ArrowDown, X, Save, MapPin, CheckCircle2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';
import { listDatasets, type DatasetHeader } from './rp-dataset-actions';
import { listMissionAssignees } from './rp-mission-write-actions';
import { getPlanCustomers, createMissionFromPlan } from './rp-mission-build-actions';
import {
  validateMissionPlan, selectedInOrder, moveSelected, toggleSelected, planToMapPoints,
  type PlanCustomer,
} from './rp-mission-build';
import { FvMap } from './fv-map';

/**
 * PR-5 — the Mission Builder (admin/planner). Pick a saved dataset, search + select
 * customers, order them into stops (move up/down), name the plan, optionally assign a rep,
 * and save → persists a mission + stops on the canonical RP Missions path. The rep then
 * runs it from My Missions (PR-4). All writes are perm-gated + RLS-backed server-side.
 */
export function MissionBuilder() {
  const { t, locale } = useI18n();
  const [datasets, setDatasets] = useState<DatasetHeader[]>([]);
  const [datasetId, setDatasetId] = useState<string>('');
  const [customers, setCustomers] = useState<PlanCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [missionDate, setMissionDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<'list' | 'map'>('list');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [ds, asg] = await Promise.all([listDatasets(), listMissionAssignees()]);
      if (ds.ok && ds.data) { setDatasets(ds.data); if (ds.data[0]) setDatasetId(ds.data[0].id); }
      if (asg.ok) setAssignees(asg.data);
    })();
  }, []);

  const loadCustomers = useCallback(async (id: string, q: string) => {
    if (!id) { setCustomers([]); return; }
    setLoadingCustomers(true);
    const res = await getPlanCustomers(id, q);
    setCustomers(res.ok ? res.data : []);
    setLoadingCustomers(false);
  }, []);
  useEffect(() => { void loadCustomers(datasetId, ''); setSelectedIds([]); }, [datasetId, loadCustomers]);

  async function onSave() {
    setErr(null);
    const v = validateMissionPlan({ name, selectedIds });
    if (v) { setErr(v === 'err_name_required' ? t('rpMissionBuild.errName') : t('rpMissionBuild.errNoStops')); return; }
    setSaving(true);
    const res = await createMissionFromPlan({
      name, missionDate: missionDate || null, assignedTo: assignedTo || null,
      datasetId, orderedCustomerIds: selectedIds,
    });
    setSaving(false);
    if (!res.ok) { setErr(t('rpMissionBuild.err')); return; }
    setSavedId(res.data.id);
  }

  if (savedId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
        <p className="text-lg font-semibold text-slate-900">{t('rpMissionBuild.saved')}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={`/distribution/route-planner/my-missions/${savedId}`} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{t('rpMissionBuild.viewMission')}</Link>
          <button onClick={() => { setSavedId(null); setSelectedIds([]); setName(''); setMissionDate(''); setAssignedTo(''); }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{t('rpMissionBuild.buildAnother')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/distribution/route-planner" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={t('rpMissionBuild.back')}>
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Route className="h-5 w-5 text-blue-600" /> {t('rpMissionBuild.title')}</h1>
          <p className="text-sm text-slate-500">{t('rpMissionBuild.subtitle')}</p>
        </div>
      </div>

      {datasets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-slate-400">{t('rpMissionBuild.noDatasets')}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          {/* Left: dataset + customer picker / map */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400 rtl:left-auto rtl:right-2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void loadCustomers(datasetId, search); }}
                  placeholder={t('rpMissionBuild.searchCustomers')}
                  className="w-full rounded-lg border border-slate-200 py-2 ps-8 pe-3 text-sm" />
              </div>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {(['list', 'map'] as const).map((tb) => (
                  <button key={tb} onClick={() => setTab(tb)}
                    className={cn('rounded-md px-3 py-1 text-sm font-medium', tab === tb ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}>
                    {t(`rpMissionBuild.tab_${tb}`)}
                  </button>
                ))}
              </div>
            </div>

            {tab === 'map' ? (
              <div className="h-[55vh] overflow-hidden rounded-lg border border-slate-200">
                <FvMap points={planToMapPoints(selectedInOrder(customers, selectedIds))} gps={null} locale={locale} t={t} onOpenCustomer={() => {}} />
              </div>
            ) : loadingCustomers ? (
              <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : customers.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">{t('rpMissionBuild.noCustomers')}</div>
            ) : (
              <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
                {customers.map((c) => {
                  const on = selectedIds.includes(c.id);
                  return (
                    <li key={c.id}>
                      <button onClick={() => setSelectedIds((p) => toggleSelected(p, c.id))}
                        className={cn('flex w-full items-center gap-3 px-2 py-2 text-start hover:bg-slate-50', on && 'bg-blue-50/50')}>
                        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300')}>
                          {on && <CheckCircle2 className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">{c.name}</span>
                          <span className="block truncate text-xs text-slate-400">{[c.code, c.city, c.channel].filter(Boolean).join(' · ')}</span>
                        </span>
                        {!on && <Plus className="h-4 w-4 text-slate-300" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Right: selected stops + plan summary */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                <span>{t('rpMissionBuild.selected')}</span>
                <span className="text-slate-400">{t('rpMissionBuild.count', { n: selectedIds.length })}</span>
              </p>
              {selectedIds.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">{t('rpMissionBuild.emptySelection')}</p>
              ) : (
                <ol className="max-h-64 space-y-1 overflow-y-auto">
                  {selectedInOrder(customers, selectedIds).map((c, i) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{c.name}</span>
                      <button onClick={() => setSelectedIds((p) => moveSelected(p, c.id, -1))} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label={t('rpMissionBuild.moveUp')}><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setSelectedIds((p) => moveSelected(p, c.id, 1))} className="rounded p-1 text-slate-400 hover:bg-slate-200" aria-label={t('rpMissionBuild.moveDown')}><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setSelectedIds((p) => p.filter((x) => x !== c.id))} className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600" aria-label={t('rpMissionBuild.remove')}><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">{t('rpMissionBuild.planName')}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('rpMissionBuild.planNamePlaceholder')}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{t('rpMissionBuild.missionDate')}</label>
                  <input type="date" value={missionDate} onChange={(e) => setMissionDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{t('rpMissionBuild.assignTo')}</label>
                  <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="">{t('rpMissionBuild.unassigned')}</option>
                    {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
              <button onClick={() => void onSave()} disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? t('rpMissionBuild.saving') : t('rpMissionBuild.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
