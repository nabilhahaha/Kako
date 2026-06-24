'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, AlertTriangle, RefreshCw, ChevronLeft, BarChart3, LayoutGrid, Image as ImageIcon, Download } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getFormsOverview, getFormsCross, type FormOverviewRow, type CrossRow } from './rp-forms-dashboard-actions';
import { buildCrossExportRows, type CommonHeaders, type ExportSubmission } from '@/lib/forms/form-export';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { downloadXlsx } from './xlsx-download';

type Preset = 'all' | 'today' | 'week' | 'month';
type Tab = 'overview' | 'cross';

function rangeFor(p: Preset): { from: string | null; to: string | null } {
  if (p === 'all') return { from: null, to: null };
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (p === 'week') start.setDate(start.getDate() - 6);
  else if (p === 'month') start.setDate(start.getDate() - 29);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Forms reporting dashboard (admin / field_verification.reports). Two views: an Overview table
 * (per-form rollups) and a Cross-Form table (common columns across all custom forms, filterable
 * by date / form / rep / search / city). Data via the SECURITY DEFINER erp_forms_overview /
 * erp_forms_cross RPCs. Read-only; Field Verification reporting untouched.
 */
export function FormsDashboardPanel() {
  const { t, locale } = useI18n();
  const lang: 'ar' | 'en' = locale === 'ar' ? 'ar' : 'en';
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<FormOverviewRow[]>([]);
  const [cross, setCross] = useState<CrossRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('all');
  const [formId, setFormId] = useState('');
  const [rep, setRep] = useState('');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true); setErr(null);
    const res = await getFormsOverview();
    if (res.ok) { setOverview(res.data); setPending(false); }
    else if (res.error === 'err_dash_pending_migration') setPending(true);
    else setErr(res.error);
    setLoading(false);
  }, []);

  const loadCross = useCallback(async () => {
    setLoading(true); setErr(null);
    const { from, to } = rangeFor(preset);
    const res = await getFormsCross({ from, to, formId: formId || null, rep: rep || null, search: search || null, city: city || null });
    if (res.ok) { setCross(res.data); setPending(false); }
    else if (res.error === 'err_dash_pending_migration') setPending(true);
    else setErr(res.error);
    setLoading(false);
  }, [preset, formId, rep, search, city]);

  useEffect(() => { if (tab === 'overview') void loadOverview(); else void loadCross(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, preset, formId]);

  const reps = useMemo(() => { const m = new Map<string, string>(); for (const r of cross) if (r.createdBy) m.set(r.createdBy, r.repName ?? r.createdBy); return [...m.entries()]; }, [cross]);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === 'ar' ? 'ar' : 'en') : '—');

  function onExportCross() {
    if (cross.length === 0) return;
    const common: CommonHeaders = {
      formName: t('rpFormReport.exp_form'), version: t('rpFormReport.exp_version'), submissionId: t('rpFormReport.exp_id'),
      customerCode: t('rpFormReport.exp_code'), customerName: t('rpFormReport.exp_customer'), rep: t('rpFormReport.exp_rep'),
      datetime: t('rpFormReport.exp_date'), status: t('rpFormReport.exp_status'), gpsLat: t('rpFormReport.exp_lat'),
      gpsLng: t('rpFormReport.exp_lng'), photos: t('rpFormReport.exp_photos'),
    };
    const subs: ExportSubmission[] = cross.map((r) => ({
      id: r.responseId, version: r.version, formName: r.formName, recordCode: r.recordCode, recordName: r.recordName,
      repName: r.repName, createdAt: r.createdAt, status: r.status, gpsLat: r.gpsLat, gpsLng: r.gpsLng, photoCount: r.photoCount,
    }));
    const table = buildCrossExportRows(subs, { common });
    const sheet = { name: t('rpFormsDash.tab_cross'), rows: [table.columns, ...table.rows] };
    downloadXlsx(buildXlsxWorkbook([sheet]), `forms-cross-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  const nameOf = (r: { nameEn: string; nameAr: string; code: string }) => (lang === 'ar' ? r.nameAr : r.nameEn) || (lang === 'ar' ? r.nameEn : r.nameAr) || r.code;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/field-verification/forms" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t('rpFormsDash.back')}</Link>
        <button onClick={() => (tab === 'overview' ? void loadOverview() : void loadCross())} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{t('rpFormsDash.refresh')}
        </button>
      </div>
      <div>
        <h1 className="flex items-center gap-2 text-lg font-extrabold"><BarChart3 className="h-5 w-5" />{t('rpFormsDash.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('rpFormsDash.subtitle')}</p>
      </div>

      <div className="inline-flex gap-1 rounded-xl border bg-muted/30 p-1">
        {(['overview', 'cross'] as Tab[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            {k === 'overview' ? <LayoutGrid className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}{t(`rpFormsDash.tab_${k}`)}
          </button>
        ))}
      </div>

      {err && <p className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{err}</p>}
      {pending && <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />{t('rpFormsDash.pendingMigration')}</p>}

      {tab === 'cross' && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="h-9 rounded-lg border bg-background px-2 text-xs font-semibold">
            {(['all', 'today', 'week', 'month'] as Preset[]).map((p) => <option key={p} value={p}>{t(`rpFormsDash.date_${p}`)}</option>)}
          </select>
          <select value={formId} onChange={(e) => setFormId(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">
            <option value="">{t('rpFormsDash.allForms')}</option>
            {overview.map((o) => <option key={o.formId} value={o.formId}>{nameOf(o)}</option>)}
          </select>
          <select value={rep} onChange={(e) => setRep(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">
            <option value="">{t('rpFormsDash.allReps')}</option>
            {reps.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadCross(); }} placeholder={t('rpFormsDash.city')} className="h-9 w-28 rounded-lg border bg-background px-2 text-xs" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void loadCross(); }} placeholder={t('rpFormsDash.search')} className="h-9 min-w-[9rem] flex-1 rounded-lg border bg-background px-3 text-xs" />
          <button onClick={() => void loadCross()} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">{t('rpFormsDash.apply')}</button>
          <button onClick={onExportCross} disabled={cross.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />{t('rpFormReport.export')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : tab === 'overview' ? (
        overview.length === 0 && !pending ? (
          <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t('rpFormsDash.overviewEmpty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colForm')}</th>
                  <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colStatus')}</th>
                  <th className="px-3 py-2 text-end font-bold">{t('rpFormsDash.colAssigned')}</th>
                  <th className="px-3 py-2 text-end font-bold">{t('rpFormsDash.colSubmissions')}</th>
                  <th className="px-3 py-2 text-end font-bold">{t('rpFormsDash.colPhotos')}</th>
                  <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colLast')}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {overview.map((o) => (
                  <tr key={o.formId} className="border-t">
                    <td className="px-3 py-2 font-semibold">{nameOf(o)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${o.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{t(o.isActive ? 'rpFormsDash.active' : 'rpFormsDash.inactive')}</span></td>
                    <td className="px-3 py-2 text-end tabular-nums">{o.assignedCount}</td>
                    <td className="px-3 py-2 text-end font-bold tabular-nums">{o.submissions}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{o.photos}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{o.lastSubmission ? fmt(o.lastSubmission) : t('rpFormsDash.never')}</td>
                    <td className="px-3 py-2 text-end"><Link href={`/field-verification/forms/${o.formId}/report`} className="rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-muted/50">{t('rpFormsDash.openReport')}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : cross.length === 0 && !pending ? (
        <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t('rpFormsDash.crossEmpty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colForm')}</th>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colCustomer')}</th>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colRep')}</th>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colCity')}</th>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormsDash.colDate')}</th>
                <th className="px-3 py-2 text-end font-bold">{t('rpFormsDash.colPhotos')}</th>
              </tr>
            </thead>
            <tbody>
              {cross.map((r) => (
                <tr key={r.responseId} className="border-t">
                  <td className="px-3 py-2 font-semibold">{r.formName}</td>
                  <td className="px-3 py-2">{r.recordName || '—'}{r.recordCode ? <span className="text-muted-foreground"> · {r.recordCode}</span> : ''}</td>
                  <td className="px-3 py-2">{r.repName || '—'}</td>
                  <td className="px-3 py-2">{r.city || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-2 text-end">{r.photoCount > 0 ? <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{r.photoCount}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
