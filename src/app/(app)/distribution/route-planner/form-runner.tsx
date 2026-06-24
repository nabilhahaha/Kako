'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Check, AlertTriangle, ChevronLeft, Camera, X, Search, Store, MapPin, CheckCircle2, ArrowRight,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getFormForFill, getMyFormCustomers, submitFormResponse, type FormForFill, type MyFormCustomer } from './rp-myforms-actions';
import { uploadAttachment } from '@/app/(app)/attachments/actions';
import { visibleFields, isPhotoField, fieldLabel, type FormField } from '@/lib/forms/form-schema';
import { validateSubmission } from '@/lib/forms/form-submission';

type Gps = { lat: number; lng: number } | null;

/**
 * Generic form runner (rep). Renders a published form's schema, captures answers/photos/GPS,
 * validates (client + server), and writes ONE immutable erp_form_responses row via
 * submitFormResponse. The FV verification flow is untouched. Submit/photo/GPS rules come from
 * the form's OWN published settings — independent of Field Verification.
 */
export function FormRunner({ formId }: { formId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const lang: 'ar' | 'en' = locale === 'ar' ? 'ar' : 'en';

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormForFill | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [photoFiles, setPhotoFiles] = useState<Record<string, File[]>>({});
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<MyFormCustomer | null>(null);
  const [customers, setCustomers] = useState<MyFormCustomer[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [gps, setGps] = useState<Gps>(null);
  const [gpsError, setGpsError] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<'fill' | 'done'>('fill');
  const [msg, setMsg] = useState<string | null>(null);
  const [errFields, setErrFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      const res = await getFormForFill(formId);
      if (res.ok) setForm(res.data); else setLoadErr(res.error);
      setLoading(false);
    })();
  }, [formId]);

  const needsCustomer = form && form.schema.settings.customerLink !== 'none';
  const requireGps = !!form && form.schema.settings.requireGps;

  const requestGps = useCallback(() => {
    setGpsError(false);
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGpsError(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);
  useEffect(() => { if (requireGps) requestGps(); }, [requireGps, requestGps]);

  const loadCustomers = useCallback(async (term: string) => {
    const res = await getMyFormCustomers(formId, term);
    if (res.ok) setCustomers(res.data);
  }, [formId]);
  useEffect(() => { if (custOpen) void loadCustomers(custSearch); }, [custOpen, custSearch, loadCustomers]);

  const photoPlaceholders = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [k, files] of Object.entries(photoFiles)) out[k] = files.map((_, i) => `local_${i}`);
    return out;
  }, [photoFiles]);

  function setAnswer(id: string, v: unknown) { setAnswers((a) => ({ ...a, [id]: v })); }
  function addPhotos(id: string, files: File[]) { setPhotoFiles((p) => ({ ...p, [id]: [...(p[id] ?? []), ...files] })); }
  function removePhoto(id: string, i: number) { setPhotoFiles((p) => ({ ...p, [id]: (p[id] ?? []).filter((_, k) => k !== i) })); }

  async function onSubmit() {
    if (!form) return;
    const errs = validateSubmission(form.schema, { answers, customerId, photoIdsByField: photoPlaceholders, hasGps: !!gps });
    if (errs.length > 0) {
      setErrFields(new Set(errs.map((e) => e.scope)));
      setMsg(t('rpMyForms.fixErrors'));
      return;
    }
    setSubmitting(true); setMsg(null); setErrFields(new Set());
    try {
      // upload photos → ids per field
      const photoIdsByField: Record<string, string[]> = {};
      for (const [fid, files] of Object.entries(photoFiles)) {
        const ids: string[] = [];
        for (const file of files) {
          const fd = new FormData();
          fd.append('entity', 'customer'); fd.append('record_id', customerId ?? formId); fd.append('file', file);
          const up = await uploadAttachment(fd);
          if (!up.ok || !up.data?.id) { setMsg(t('rpMyForms.errPhoto')); setSubmitting(false); return; }
          ids.push(up.data.id);
        }
        if (ids.length) photoIdsByField[fid] = ids;
      }
      const res = await submitFormResponse({ formId, customerId, answers, photoIdsByField, gps });
      if (!res.ok) { setMsg(res.error === 'err_invalid_submission' ? t('rpMyForms.fixErrors') : res.error); setSubmitting(false); return; }
      setPhase('done');
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (loadErr || !form) return (
    <div className="mx-auto max-w-md p-4">
      <p className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />{t('rpMyForms.notAssigned')}</p>
      <button onClick={() => router.push('/field-verification/my-forms')} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t('rpMyForms.back')}</button>
    </div>
  );

  const title = (lang === 'ar' ? form.nameAr : form.nameEn) || form.nameEn || form.nameAr;

  if (phase === 'done') return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-card p-8 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"><CheckCircle2 className="h-12 w-12 text-emerald-600" /></div>
        <p className="text-xl font-extrabold text-emerald-800">{t('rpMyForms.doneTitle')}</p>
        <p className="text-sm text-emerald-700">{title}</p>
      </div>
      <button onClick={() => router.push('/field-verification/my-forms')}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground active:scale-[0.99]">
        {t('rpMyForms.backToForms')} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
      </button>
    </div>
  );

  const visible = visibleFields(form.schema);

  return (
    <div className="mx-auto max-w-md space-y-3 p-4 pb-28">
      <button onClick={() => router.push('/field-verification/my-forms')} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t('rpMyForms.back')}
      </button>
      <h1 className="text-lg font-extrabold">{title}</h1>

      {/* customer picker */}
      {needsCustomer && (
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('rpMyForms.customer')}{form.schema.settings.customerLink === 'required' && <span className="text-red-500"> *</span>}</p>
          {customer ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><Store className="h-4 w-4 text-primary" />{customer.name}{customer.code ? ` · ${customer.code}` : ''}</span>
              <button onClick={() => { setCustomer(null); setCustomerId(null); }} className="text-xs font-semibold text-muted-foreground">{t('rpMyForms.change')}</button>
            </div>
          ) : (
            <button onClick={() => setCustOpen(true)} className={`mt-1 flex h-10 w-full items-center justify-between rounded-xl border px-3 text-sm ${errFields.has('customer') ? 'border-red-400' : ''}`}>
              <span className="text-muted-foreground">{t('rpMyForms.selectCustomer')}</span><Search className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* GPS */}
      {requireGps && (
        <div className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs ${gps ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : errFields.has('gps') ? 'border-red-400 bg-red-50 text-red-700' : 'bg-muted/30 text-muted-foreground'}`}>
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{gps ? t('rpMyForms.gpsOn') : t('rpMyForms.gpsNeeded')}</span>
          {!gps && <button onClick={requestGps} className="font-semibold underline">{t('rpMyForms.enableGps')}</button>}
        </div>
      )}
      {requireGps && gpsError && !gps && <p className="text-[11px] text-amber-700">{t('rpMyForms.gpsDenied')}</p>}

      {/* fields */}
      {visible.map((f) => (
        <Field key={f.id} label={fieldLabel(f, lang)} required={f.required} help={f.help} error={errFields.has(f.id)}>
          <FieldControl f={f} lang={lang} value={answers[f.id]} onChange={(v) => setAnswer(f.id, v)}
            files={photoFiles[f.id] ?? []} onAddPhotos={(fs) => addPhotos(f.id, fs)} onRemovePhoto={(i) => removePhoto(f.id, i)}
            t={t} />
        </Field>
      ))}

      {msg && <p className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{msg}</p>}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-3 backdrop-blur max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <button onClick={() => void onSubmit()} disabled={submitting}
          className="mx-auto flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60 active:scale-[0.99]">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{submitting ? t('rpMyForms.submitting') : t('rpMyForms.submit')}
        </button>
      </div>

      {custOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCustOpen(false)} />
          <div className="relative max-h-[75vh] overflow-y-auto rounded-t-3xl border-t bg-card p-4">
            <div className="mb-2 flex items-center gap-2 rounded-xl border bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input autoFocus value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder={t('rpMyForms.searchCustomer')} className="h-11 w-full bg-transparent text-base outline-none" />
              <button onClick={() => setCustOpen(false)} aria-label={t('rpMyForms.close')}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            {customers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('rpMyForms.noCustomers')}</p>
            ) : (
              <ul className="space-y-1 pb-4">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => { setCustomer(c); setCustomerId(c.id); setCustOpen(false); }} className="flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-start active:scale-[0.99]">
                      <Store className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{c.name}</span><span className="text-[11px] text-muted-foreground">{[c.code, c.city, c.channel].filter(Boolean).join(' · ')}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, required, help, error, children }: { label: string; required?: boolean; help?: string | null; error?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={`text-sm font-semibold ${error ? 'text-red-600' : ''}`}>{label}{required && <span className="text-red-500"> *</span>}</span>
      {help && <span className="block text-[11px] font-normal text-muted-foreground">{help}</span>}
      {children}
    </label>
  );
}

function FieldControl({ f, lang, value, onChange, files, onAddPhotos, onRemovePhoto, t }: {
  f: FormField; lang: 'ar' | 'en'; value: unknown; onChange: (v: unknown) => void;
  files: File[]; onAddPhotos: (f: File[]) => void; onRemovePhoto: (i: number) => void;
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const base = 'h-12 w-full rounded-xl border bg-background px-3 text-base outline-none';
  if (isPhotoField(f.type)) {
    return <PhotoInput files={files} multiple={f.type === 'photos'} onAdd={onAddPhotos} onRemove={onRemovePhoto} t={t} />;
  }
  switch (f.type) {
    case 'textarea':
      return <textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full rounded-xl border bg-background px-3 py-2 text-base" />;
    case 'number':
      return <input type="number" inputMode="decimal" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base} />;
    case 'phone':
      return <input type="tel" inputMode="tel" dir="ltr" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base} />;
    case 'date':
      return <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base} />;
    case 'boolean':
      return (
        <label className="flex h-12 items-center gap-2 rounded-xl border bg-background px-3 text-sm">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{t('rpMyForms.yes')}
        </label>
      );
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">{t('rpMyForms.choose')}</option>
          {f.options.map((o) => <option key={o.value} value={o.value}>{lang === 'ar' ? o.labelAr : o.labelEn}</option>)}
        </select>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="space-y-1 rounded-xl border bg-background p-2">
          {f.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 px-1 py-1 text-sm">
              <input type="checkbox" checked={arr.includes(o.value)} onChange={() => toggle(o.value)} />{lang === 'ar' ? o.labelAr : o.labelEn}
            </label>
          ))}
        </div>
      );
    }
    default:
      return <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base} />;
  }
}

function PhotoInput({ files, multiple, onAdd, onRemove, t }: { files: File[]; multiple?: boolean; onAdd: (f: File[]) => void; onRemove: (i: number) => void; t: (k: string) => string }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return (
    <div className="space-y-2">
      <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold text-primary active:scale-[0.99]">
        <Camera className="h-5 w-5" />{t('rpMyForms.takePhoto')}
        <input type="file" accept="image/*" capture="environment" multiple={multiple} className="hidden"
          onChange={(e) => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt={f.name} className="h-20 w-20 rounded-lg border object-cover" />
              <button type="button" onClick={() => onRemove(i)} className="absolute -end-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow active:scale-95"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
