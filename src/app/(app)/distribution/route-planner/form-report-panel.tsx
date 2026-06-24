'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, RefreshCw, ChevronLeft, X, Image as ImageIcon, MapPin, User, Clock, FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import {
  getFormReport, getFormReportVersions, getFormReportPhotos,
  type FormSubmissionRow, type FormMeta,
} from './rp-form-report-actions';
import { reportFields, answerText, fieldLabel, type FormSchema } from '@/lib/forms/form-schema';

type Preset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

function rangeFor(p: Preset): { from: string | null; to: string | null } {
  if (p === 'all' || p === 'custom') return { from: null, to: null };
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (p === 'yesterday') { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
  else if (p === 'week') start.setDate(start.getDate() - 6);
  else if (p === 'month') start.setDate(start.getDate() - 29);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Single Form Report (admin / field_verification.reports). Lists a form's submissions (scoped by
 * the erp_form_submissions RPC), with date/rep/search filters and a detail drawer that renders
 * each submission's answers using the schema of the version it was submitted with, plus photos
 * for authorized viewers and a GPS/radius summary. Read-only; FV reporting untouched.
 */
export function FormReportPanel({ formId }: { formId: string }) {
  const { t, locale } = useI18n();
  const lang: 'ar' | 'en' = locale === 'ar' ? 'ar' : 'en';
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [rows, setRows] = useState<FormSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>('all');
  const [rep, setRep] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<FormSubmissionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { from, to } = rangeFor(preset);
    const [m, r] = await Promise.all([
      meta ? Promise.resolve({ ok: true as const, data: meta }) : getFormReportVersions(formId),
      getFormReport(formId, { from, to, rep: rep || null, search: search || null }),
    ]);
    if (m.ok) setMeta(m.data);
    if (r.ok) { setRows(r.data); setPending(false); }
    else if (r.error === 'err_report_pending_migration') { setPending(true); setRows([]); }
    else setErr(r.error);
    setLoading(false);
  }, [formId, preset, rep, search, meta]);

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [formId, preset]);

  const reps = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) if (r.createdBy) m.set(r.createdBy, r.repName ?? r.createdBy);
    return [...m.entries()];
  }, [rows]);

  const title = meta ? ((lang === 'ar' ? meta.nameAr : meta.nameEn) || meta.nameEn || meta.nameAr) : '';
  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar' : 'en');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/field-verification/forms" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t('rpFormReport.back')}</Link>
        <button onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted/50 disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{t('rpFormReport.refresh')}
        </button>
      </div>
      <div>
        <h1 className="flex items-center gap-2 text-lg font-extrabold"><FileText className="h-5 w-5" />{title || t('rpFormReport.title')}</h1>
        <p className="text-xs text-muted-foreground">{t('rpFormReport.count', { n: rows.length })}</p>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="h-9 rounded-lg border bg-background px-2 text-xs font-semibold">
          {(['all', 'today', 'yesterday', 'week', 'month'] as Preset[]).map((p) => <option key={p} value={p}>{t(`rpFormReport.date_${p}`)}</option>)}
        </select>
        <select value={rep} onChange={(e) => setRep(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-xs">
          <option value="">{t('rpFormReport.allReps')}</option>
          {reps.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }}
          placeholder={t('rpFormReport.search')} className="h-9 min-w-[10rem] flex-1 rounded-lg border bg-background px-3 text-xs" />
      </div>

      {err && <p className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{err}</p>}
      {pending && <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" />{t('rpFormReport.pendingMigration')}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 && !pending ? (
        <p className="rounded-xl border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{t('rpFormReport.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormReport.colCustomer')}</th>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormReport.colRep')}</th>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormReport.colDate')}</th>
                <th className="px-3 py-2 text-start font-bold">{t('rpFormReport.colPhotos')}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2"><span className="font-semibold">{r.recordName || '—'}</span>{r.recordCode ? <span className="text-muted-foreground"> · {r.recordCode}</span> : ''}</td>
                  <td className="px-3 py-2">{r.repName || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-2 text-xs">{r.photoIds.length > 0 ? <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{r.photoIds.length}</span> : '—'}</td>
                  <td className="px-3 py-2 text-end"><button onClick={() => setSelected(r)} className="rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-muted/50">{t('rpFormReport.view')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && meta && (
        <DetailDrawer row={selected} schema={meta.versions[selected.version]} lang={lang} t={t} fmt={fmt} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function DetailDrawer({ row, schema, lang, t, fmt, onClose }: {
  row: FormSubmissionRow; schema: FormSchema | undefined; lang: 'ar' | 'en';
  t: (k: string, p?: Record<string, string | number>) => string; fmt: (iso: string) => string; onClose: () => void;
}) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photosLoading, setPhotosLoading] = useState(false);
  useEffect(() => {
    if (row.photoIds.length === 0) return;
    setPhotosLoading(true);
    void getFormReportPhotos(row.photoIds).then((res) => { if (res.ok) setPhotoUrls(Object.fromEntries(res.data.map((p) => [p.id, p.url]))); }).finally(() => setPhotosLoading(false));
  }, [row]);

  const fields = schema ? reportFields(schema) : [];
  const radiusWaived = row.radiusEnforced === false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-md overflow-y-auto border-s bg-card p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-extrabold">{row.recordName || t('rpFormReport.noCustomer')}</p>
            <p className="text-xs text-muted-foreground">{row.recordCode ?? ''}</p>
          </div>
          <button onClick={onClose} aria-label={t('rpFormReport.close')} className="flex h-8 w-8 items-center justify-center rounded-full border"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{row.repName ?? '—'}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmt(row.createdAt)}</span>
          <span>{t('rpFormReport.versionLabel', { n: row.version })}</span>
          {row.gpsLat != null && row.gpsLng != null && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{row.gpsLat.toFixed(4)}, {row.gpsLng.toFixed(4)}</span>}
        </div>
        {radiusWaived && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{t('rpFormReport.radiusWaived')}</p>
        )}

        {/* answers via the submitted version's schema */}
        <div className="mt-3 space-y-2">
          {fields.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{t('rpFormReport.noAnswers')}</p>
          ) : fields.map((f) => {
            const val = answerText(f, row.answers[f.id], lang, t('rpFormReport.yes'), t('rpFormReport.no'));
            return (
              <div key={f.id} className="rounded-lg border bg-background p-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{fieldLabel(f, lang)}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{val || '—'}</p>
              </div>
            );
          })}
        </div>

        {/* photos */}
        {row.photoIds.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('rpFormReport.photos')}</p>
            {photosLoading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('rpFormReport.loadingPhotos')}</p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {row.photoIds.map((id) => photoUrls[id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={id} src={photoUrls[id]} alt="" className="aspect-square w-full rounded-lg border object-cover" />
                ) : <div key={id} className="flex aspect-square items-center justify-center rounded-lg border text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
