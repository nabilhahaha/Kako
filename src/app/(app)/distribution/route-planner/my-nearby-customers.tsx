'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Navigation, Camera, Check, RefreshCw, ChevronRight, ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getMyNearbyCustomers, submitVerification, type NearbyCustomer, type MyProgress } from './rp-verification-actions';
import { getVerificationConfig } from './rp-verification-config-actions';
import { uploadAttachment } from '@/app/(app)/attachments/actions';
import { NEARBY_RADIUS_M } from '@/lib/erp/geo-distance';

type GpsState = { lat: number; lng: number } | null;
type Phase = 'list' | 'form' | 'done';

/**
 * FV-3 — mobile-first field screen. GPS → progress → assigned customers within 50 m →
 * verify form (City/Channel/outside photo required) → submit (FV-2) → done. The 50 m lock,
 * assignment scope and "verify once" are all re-enforced server-side.
 */
export function MyNearbyCustomers() {
  const { t } = useI18n();
  const [gps, setGps] = useState<GpsState>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nearby, setNearby] = useState<NearbyCustomer[]>([]);
  const [progress, setProgress] = useState<MyProgress>({ total: 0, completed: 0, remaining: 0, pct: 0 });
  const [config, setConfig] = useState<{ cities: string[]; channels: string[] }>({ cities: [], channels: [] });

  const [phase, setPhase] = useState<Phase>('list');
  const [sel, setSel] = useState<NearbyCustomer | null>(null);
  const [form, setForm] = useState({ city: '', channel: '', phone: '', notes: '' });
  const [outside, setOutside] = useState<File | null>(null);
  const [inside, setInside] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (fix: GpsState) => {
    setLoading(true);
    const res = await getMyNearbyCustomers(fix);
    if (res.ok) { setNearby(res.data.nearby); setProgress(res.data.progress); }
    setLoading(false);
  }, []);

  const requestGps = useCallback(() => {
    setGpsError(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGpsError('unsupported'); void load(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setGps(fix); void load(fix); },
      () => { setGpsError('denied'); void load(null); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [load]);

  useEffect(() => {
    void (async () => {
      const c = await getVerificationConfig();
      if (c.ok) setConfig(c.data);
    })();
    requestGps();
  }, [requestGps]);

  function openForm(c: NearbyCustomer) {
    setSel(c); setErr(null);
    setForm({ city: c.city ?? '', channel: c.channel ?? '', phone: c.phone ?? '', notes: '' });
    setOutside(null); setInside([]); setPhase('form');
  }

  async function uploadPhoto(customerId: string, file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('entity', 'customer'); fd.append('record_id', customerId); fd.append('file', file);
    const res = await uploadAttachment(fd);
    return res.ok ? (res.data?.id ?? null) : null;
  }

  async function onSubmit() {
    if (!sel || !gps) return;
    if (!form.city.trim() || !form.channel.trim()) { setErr(t('rpVerify.errRequired')); return; }
    if (!outside) { setErr(t('rpVerify.errOutsidePhoto')); return; }
    setSubmitting(true); setErr(null);
    try {
      const outsideId = await uploadPhoto(sel.id, outside);
      if (!outsideId) { setErr(t('rpVerify.errPhotoUpload')); setSubmitting(false); return; }
      const insideIds: string[] = [];
      for (const f of inside) { const id = await uploadPhoto(sel.id, f); if (id) insideIds.push(id); }
      const res = await submitVerification({
        customerId: sel.id, gps,
        city: form.city, channel: form.channel,
        phone: form.phone || null, outsidePhotoId: outsideId, insidePhotoIds: insideIds,
        notes: form.notes || null,
      });
      if (!res.ok) { setErr(t(`rpVerify.e_${res.error}` as 'rpVerify.e_err_too_far') || res.error); setSubmitting(false); return; }
      setPhase('done');
      await load(gps);  // refresh progress; verified customer drops off the list
    } finally { setSubmitting(false); }
  }

  // ── progress header (always visible) ─────────────────────────────────────
  const Progress = () => (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{t('rpVerify.progress')}</span>
        <span className="text-2xl font-extrabold tabular-nums text-primary">{progress.pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[['total', progress.total], ['completed', progress.completed], ['remaining', progress.remaining]].map(([k, v]) => (
          <div key={k as string} className="rounded-xl bg-muted/50 py-2">
            <p className="text-lg font-bold tabular-nums">{v as number}</p>
            <p className="text-[11px] text-muted-foreground">{t(`rpVerify.${k}` as 'rpVerify.total')}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ── DONE ─────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-md space-y-4 p-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600" />
          <p className="text-lg font-bold text-emerald-800">{t('rpVerify.doneTitle')}</p>
          <p className="text-sm text-emerald-700">{t('rpVerify.doneSub', { name: sel?.name ?? '' })}</p>
        </div>
        <Progress />
        <button onClick={() => { setSel(null); setPhase('list'); }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground active:scale-[0.99]">
          <ArrowLeft className="h-5 w-5" /> {t('rpVerify.backToList')}
        </button>
      </div>
    );
  }

  // ── FORM ─────────────────────────────────────────────────────────────────
  if (phase === 'form' && sel) {
    return (
      <div className="mx-auto max-w-md space-y-3 p-4 pb-28">
        <button onClick={() => setPhase('list')} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> {t('rpVerify.back')}
        </button>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-base font-extrabold">{sel.name}</p>
          <p className="text-xs text-muted-foreground">{sel.code ?? ''}{sel.distanceM != null ? ` · ${t('rpVerify.metersAway', { n: sel.distanceM })}` : ''}</p>
        </div>

        <Field label={t('rpVerify.city')} required>
          <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="h-12 w-full rounded-xl border bg-background px-3 text-base">
            <option value="">{t('rpVerify.choose')}</option>
            {[...new Set([...(form.city ? [form.city] : []), ...config.cities])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={t('rpVerify.channel')} required>
          <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="h-12 w-full rounded-xl border bg-background px-3 text-base">
            <option value="">{t('rpVerify.choose')}</option>
            {[...new Set([...(form.channel ? [form.channel] : []), ...config.channels])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label={t('rpVerify.outsidePhoto')} required>
          <PhotoInput files={outside ? [outside] : []} onChange={(fs) => setOutside(fs[0] ?? null)} label={t('rpVerify.takePhoto')} />
        </Field>
        <Field label={t('rpVerify.insidePhotos')}>
          <PhotoInput multiple files={inside} onChange={setInside} label={t('rpVerify.addPhotos')} />
        </Field>

        <Field label={t('rpVerify.phone')}>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
        </Field>
        <Field label={t('rpVerify.notes')}>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-xl border bg-background px-3 py-2 text-base" />
        </Field>

        {err && <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-3 backdrop-blur">
          <button onClick={() => void onSubmit()} disabled={submitting}
            className="mx-auto flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60 active:scale-[0.99]">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {submitting ? t('rpVerify.submitting') : t('rpVerify.submit')}
          </button>
        </div>
      </div>
    );
  }

  // ── LIST ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold">{t('rpVerify.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('rpVerify.showingWithin', { n: NEARBY_RADIUS_M })}</p>
        </div>
        <button onClick={requestGps} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold active:scale-95">
          <RefreshCw className="h-3.5 w-3.5" /> {t('rpVerify.refresh')}
        </button>
      </div>

      <Progress />

      {gpsError && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">{t(gpsError === 'denied' ? 'rpVerify.gpsDenied' : 'rpVerify.gpsUnsupported')}</p>
            <button onClick={requestGps} className="mt-1 inline-flex items-center gap-1 font-semibold underline"><Navigation className="h-3.5 w-3.5" />{t('rpVerify.enableGps')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t('rpVerify.locating')}</div>
      ) : !gps ? (
        <p className="rounded-2xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">{t('rpVerify.needGps')}</p>
      ) : nearby.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-muted/30 p-8 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold">{t('rpVerify.emptyTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('rpVerify.emptySub')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {nearby.map((c) => (
            <li key={c.id}>
              <button onClick={() => openForm(c)} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-start active:scale-[0.99]">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.code ?? ''}{c.distanceM != null ? ` · ${t('rpVerify.metersAway', { n: c.distanceM })}` : ''}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}{required && <span className="text-red-600"> *</span>}</span>
      {children}
    </label>
  );
}

function PhotoInput({ files, onChange, label, multiple }: { files: File[]; onChange: (f: File[]) => void; label: string; multiple?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold text-primary active:scale-[0.99]">
        <Camera className="h-5 w-5" /> {label}
        <input type="file" accept="image/*" capture="environment" multiple={multiple} className="hidden"
          onChange={(e) => { const fs = Array.from(e.target.files ?? []); onChange(multiple ? [...files, ...fs] : fs); }} />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">
              <Check className="h-3 w-3" />{f.name.length > 16 ? f.name.slice(0, 14) + '…' : f.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
