'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, Users, Tags, Loader2, Check, CheckCircle2, AlertTriangle, Ruler } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { parseUploadColumns } from './import-actions';
import { persistDataset, listDatasets, type DatasetHeader } from './rp-dataset-actions';
import { applyColumnMapping, buildTisDatasetFromRows, TIS_MAP_FIELDS, type TisFieldKey } from '@/lib/tis/upload';
import { tisCustomersToDatasetInput } from '@/lib/erp/route-planner-dataset';
import { RADIUS_MIN_M, RADIUS_MAX_M } from '@/lib/erp/geo-distance';
import { getVerificationRadius, setVerificationRadius } from './rp-verification-radius-actions';
import { getVerificationConfig } from './rp-verification-config-actions';
import {
  listVerificationReps, getAssignmentRoster, assignCustomers,
  type RosterRow, type VerificationRep,
} from './rp-verification-admin-actions';

type Mapping = Partial<Record<TisFieldKey, string>>;
type Msg = { tone: 'ok' | 'err'; text: string } | null;

/**
 * FV-4a — Company-Admin "Field Verification Setup" panel. Three sections:
 *   1) Upload the customer list (reuses parseUploadColumns + persistDataset; no new schema)
 *   2) Assign customers to reps (writes dataset_customers.salesman; verified rows locked)
 *   3) City/Channel catalog (read-only, derived from the dataset — no free typing)
 * All writes are admin-gated + company-scoped in the server actions.
 */
export function VerificationAdminPanel() {
  const { t } = useI18n();

  // ── shared ───────────────────────────────────────────────────────────────
  const [datasets, setDatasets] = useState<DatasetHeader[]>([]);
  const [reps, setReps] = useState<VerificationRep[]>([]);
  const [catalog, setCatalog] = useState<{ cities: string[]; channels: string[] }>({ cities: [], channels: [] });

  const refreshShared = useCallback(async () => {
    const [ds, rp, cat] = await Promise.all([listDatasets(), listVerificationReps(), getVerificationConfig()]);
    if (ds.ok) setDatasets(ds.data ?? []);
    if (rp.ok) setReps(rp.data);
    if (cat.ok) setCatalog(cat.data);
  }, []);
  useEffect(() => { void refreshShared(); }, [refreshShared]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('rpVerifyAdmin.hint')}</p>
      <RadiusSection t={t} />
      <UploadSection t={t} onSaved={refreshShared} />
      <AssignSection t={t} datasets={datasets} reps={reps} />
      <CatalogSection t={t} catalog={catalog} />
    </div>
  );
}

// ── 0) Radius (FV-3b setting, FV-4c admin UI) ─────────────────────────────────
function RadiusSection({ t }: { t: (k: string, p?: Record<string, string | number>) => string }) {
  const [radius, setRadius] = useState<number | ''>('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    void (async () => {
      const res = await getVerificationRadius();
      if (res.ok) setRadius(res.data.radiusM);
      setLoaded(true);
    })();
  }, []);

  async function onSave() {
    const r = Number(radius);
    if (!Number.isFinite(r) || r < RADIUS_MIN_M || r > RADIUS_MAX_M) { setMsg({ tone: 'err', text: t('rpVerifyAdmin.radiusRange', { min: RADIUS_MIN_M, max: RADIUS_MAX_M }) }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await setVerificationRadius(r);
      setMsg(res.ok ? { tone: 'ok', text: t('rpVerifyAdmin.radiusSaved', { n: r }) } : { tone: 'err', text: res.error });
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Ruler className="h-4 w-4" />{t('rpVerifyAdmin.radiusTitle')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.radiusHint', { min: RADIUS_MIN_M, max: RADIUS_MAX_M })}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">{t('rpVerifyAdmin.radiusLabel')}</span>
          <input type="number" inputMode="numeric" min={RADIUS_MIN_M} max={RADIUS_MAX_M} value={radius} disabled={!loaded}
            onChange={(e) => setRadius(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-9 w-32 rounded-lg border bg-background px-2 text-sm" />
        </label>
        <button onClick={() => void onSave()} disabled={busy || !loaded}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('rpVerifyAdmin.save')}
        </button>
      </div>
      {msg && <Banner msg={msg} />}
    </section>
  );
}

// ── 1) Upload ────────────────────────────────────────────────────────────────
function UploadSection({ t, onSaved }: { t: (k: string, p?: Record<string, string | number>) => string; onSaved: () => void }) {
  const [parsed, setParsed] = useState<{ headers: string[]; records: Record<string, string>[]; map: Mapping } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onPick(file: File) {
    setBusy(true); setMsg(null); setParsed(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
      setParsed({ headers: res.headers, records: res.records, map: res.suggested });
      if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
    } finally { setBusy(false); }
  }

  async function onSave() {
    if (!parsed) return;
    setBusy(true); setMsg(null);
    try {
      const rows = applyColumnMapping(parsed.records, parsed.map);
      const ds = buildTisDatasetFromRows(rows, { source: 'upload' });
      const customers = tisCustomersToDatasetInput(ds.customers);
      const res = await persistDataset({ name: name.trim() || 'Verification list', source: 'manual_upload', customers, setActive: true });
      if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
      setMsg({ tone: 'ok', text: t('rpVerifyAdmin.uploadOk', { n: res.data?.rowCount ?? customers.length, v: res.data?.validCount ?? 0 }) });
      setParsed(null); setName('');
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Upload className="h-4 w-4" />{t('rpVerifyAdmin.uploadTitle')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.uploadHint')}</p>

      <label className="mt-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-4 text-sm font-semibold text-primary">
        {busy && !parsed ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy && !parsed ? t('rpVerifyAdmin.parsing') : t('rpVerifyAdmin.chooseFile')}
        <input type="file" accept=".xlsx,.csv,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPick(f); e.target.value = ''; }} />
      </label>

      {parsed && (
        <div className="mt-3 space-y-3">
          <p className="text-xs font-semibold">{t('rpVerifyAdmin.mapTitle')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TIS_MAP_FIELDS.map((f) => (
              <label key={f.key} className="block space-y-1">
                <span className="text-[11px] text-muted-foreground">{f.key}{f.required && <span className="text-red-600"> *</span>}</span>
                <select value={parsed.map[f.key] ?? ''} onChange={(e) => setParsed({ ...parsed, map: { ...parsed.map, [f.key]: e.target.value || undefined } })}
                  className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
                  <option value="">—</option>
                  {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">{t('rpVerifyAdmin.datasetName')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-56 rounded-lg border bg-background px-2 text-sm" />
            </label>
            <button onClick={() => void onSave()} disabled={busy || !parsed.map.name || !parsed.map.lat || !parsed.map.lng}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{busy ? t('rpVerifyAdmin.saving') : t('rpVerifyAdmin.save')}
            </button>
          </div>
        </div>
      )}
      {msg && <Banner msg={msg} />}
    </section>
  );
}

// ── 2) Assign ────────────────────────────────────────────────────────────────
function AssignSection({ t, datasets, reps }: { t: (k: string, p?: Record<string, string | number>) => string; datasets: DatasetHeader[]; reps: VerificationRep[] }) {
  const [datasetId, setDatasetId] = useState('');
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [rep, setRep] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const loadRoster = useCallback(async (id: string) => {
    if (!id) { setRows([]); return; }
    setLoading(true); setChecked(new Set());
    try {
      const res = await getAssignmentRoster(id);
      setRows(res.ok ? res.data.rows : []);
      if (!res.ok) setMsg({ tone: 'err', text: res.error });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadRoster(datasetId); }, [datasetId, loadRoster]);

  const assignable = rows.filter((r) => !r.verified);
  function toggle(id: string) {
    setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setChecked((s) => s.size === assignable.length ? new Set() : new Set(assignable.map((r) => r.id)));
  }

  async function onAssign(unassign: boolean) {
    if (checked.size === 0) { setMsg({ tone: 'err', text: t('rpVerifyAdmin.e_err_no_customers') }); return; }
    if (!unassign && !rep) { setMsg({ tone: 'err', text: t('rpVerifyAdmin.e_err_unknown_rep') }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await assignCustomers([...checked], unassign ? null : rep);
      if (!res.ok) { setMsg({ tone: 'err', text: res.error }); return; }
      setMsg({ tone: 'ok', text: t('rpVerifyAdmin.assignedOk', { n: res.data.updated, s: res.data.skipped }) });
      setChecked(new Set());
      await loadRoster(datasetId);
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4" />{t('rpVerifyAdmin.assignTitle')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.assignHint')}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">{t('rpVerifyAdmin.dataset')}</span>
          <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="h-9 w-64 rounded-lg border bg-background px-2 text-sm">
            <option value="">{t('rpVerifyAdmin.selectDataset')}</option>
            {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.rowCount})</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] text-muted-foreground">{t('rpVerifyAdmin.rep')}</span>
          <select value={rep} onChange={(e) => setRep(e.target.value)} disabled={reps.length === 0} className="h-9 w-64 rounded-lg border bg-background px-2 text-sm disabled:opacity-50">
            <option value="">{reps.length === 0 ? t('rpVerifyAdmin.noReps') : t('rpVerifyAdmin.selectRep')}</option>
            {reps.map((r) => <option key={r.id} value={r.email}>{r.name} · {r.email}</option>)}
          </select>
        </label>
        <button onClick={() => void onAssign(false)} disabled={busy || checked.size === 0 || !rep}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('rpVerifyAdmin.assign')}
        </button>
        <button onClick={() => void onAssign(true)} disabled={busy || checked.size === 0}
          className="inline-flex h-9 items-center rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">
          {t('rpVerifyAdmin.unassign')}
        </button>
        <span className="text-xs text-muted-foreground">{t('rpVerifyAdmin.selected', { n: checked.size })}</span>
      </div>

      {msg && <Banner msg={msg} />}

      <div className="mt-3 overflow-x-auto rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{datasetId ? t('rpVerifyAdmin.noRows') : t('rpVerifyAdmin.selectDataset')}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-2"><input type="checkbox" checked={assignable.length > 0 && checked.size === assignable.length} onChange={toggleAll} aria-label={t('rpVerifyAdmin.selectAll')} /></th>
                <th className="p-2 text-start">{t('rpVerifyAdmin.colCode')}</th>
                <th className="p-2 text-start">{t('rpVerifyAdmin.colName')}</th>
                <th className="p-2 text-start">{t('rpVerifyAdmin.colCity')}</th>
                <th className="p-2 text-start">{t('rpVerifyAdmin.colChannel')}</th>
                <th className="p-2 text-start">{t('rpVerifyAdmin.colAssigned')}</th>
                <th className="p-2 text-start">{t('rpVerifyAdmin.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 text-center">
                    <input type="checkbox" disabled={r.verified} checked={checked.has(r.id)} onChange={() => toggle(r.id)} aria-label={r.name} />
                  </td>
                  <td className="p-2">{r.code ?? '—'}</td>
                  <td className="p-2 font-medium">{r.name}</td>
                  <td className="p-2">{r.city ?? '—'}</td>
                  <td className="p-2">{r.channel ?? '—'}</td>
                  <td className="p-2">{r.assignedTo ?? <span className="text-muted-foreground">{t('rpVerifyAdmin.unassigned')}</span>}</td>
                  <td className="p-2">
                    {r.verified
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700"><CheckCircle2 className="h-3 w-3" />{t('rpVerifyAdmin.verified')}</span>
                      : <span className="text-muted-foreground">{t('rpVerifyAdmin.pending')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── 3) Catalog ───────────────────────────────────────────────────────────────
function CatalogSection({ t, catalog }: { t: (k: string, p?: Record<string, string | number>) => string; catalog: { cities: string[]; channels: string[] } }) {
  const empty = catalog.cities.length === 0 && catalog.channels.length === 0;
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Tags className="h-4 w-4" />{t('rpVerifyAdmin.catalogTitle')}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.catalogHint')}</p>
      {empty ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('rpVerifyAdmin.catalogEmpty')}</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Chips label={t('rpVerifyAdmin.cities')} values={catalog.cities} />
          <Chips label={t('rpVerifyAdmin.channels')} values={catalog.channels} />
        </div>
      )}
    </section>
  );
}
function Chips({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold">{label} <span className="text-muted-foreground">({values.length})</span></p>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.map((v) => <span key={v} className="rounded-full bg-muted px-2 py-0.5 text-xs">{v}</span>)}
      </div>
    </div>
  );
}

function Banner({ msg }: { msg: NonNullable<Msg> }) {
  return (
    <p className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-700'}`}>
      {msg.tone === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{msg.text}
    </p>
  );
}
