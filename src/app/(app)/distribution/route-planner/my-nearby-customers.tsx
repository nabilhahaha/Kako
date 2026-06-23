'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MapPin, Navigation, Camera, Check, RefreshCw, ChevronLeft, ArrowRight,
  CheckCircle2, AlertTriangle, Loader2, Store, Phone, X, Crosshair, Search,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getMyNearbyCustomers, submitVerification, type NearbyCustomer, type MyProgress } from './rp-verification-actions';
import { getVerificationConfig } from './rp-verification-config-actions';
import { filterAssignedCustomers } from './fv-customer-search';
import { uploadAttachment } from '@/app/(app)/attachments/actions';
import { NEARBY_RADIUS_M } from '@/lib/erp/geo-distance';
import { cn } from '@/lib/utils';

type GpsState = { lat: number; lng: number } | null;
type Phase = 'list' | 'form' | 'done';

/**
 * FV-5 — mobile-first field screen (mockup-aligned, RTL-friendly). GPS → radius banner +
 * progress → assigned customers within the configured radius → verify form with bottom-sheet
 * City/Channel pickers (admin catalog, FV-4d) and a current/old-values block → submit (FV-2,
 * server-validated) → success. The radius lock, assignment scope, catalog membership and
 * "verify once" are all re-enforced server-side.
 */
export function MyNearbyCustomers() {
  const { t } = useI18n();
  const [gps, setGps] = useState<GpsState>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nearby, setNearby] = useState<NearbyCustomer[]>([]);
  // The full list of customers assigned to me (any distance) — the manual selection /
  // search path, alongside the GPS Nearby list. Open is unrestricted; final submit still
  // enforces the radius + photo rule server-side.
  const [assigned, setAssigned] = useState<NearbyCustomer[]>([]);
  const [tab, setTab] = useState<'nearby' | 'assigned'>('nearby');
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<MyProgress>({ total: 0, completed: 0, remaining: 0, pct: 0 });
  const [config, setConfig] = useState<{ cities: string[]; channels: string[] }>({ cities: [], channels: [] });
  // The active proximity radius is set per-company by the admin (FV-3b); default until loaded.
  const [radiusM, setRadiusM] = useState<number>(NEARBY_RADIUS_M);

  const [phase, setPhase] = useState<Phase>('list');
  const [sel, setSel] = useState<NearbyCustomer | null>(null);
  const [form, setForm] = useState({ city: '', channel: '', phone: '', notes: '' });
  const [outside, setOutside] = useState<File | null>(null);
  const [inside, setInside] = useState<File[]>([]);
  const [sheet, setSheet] = useState<null | 'city' | 'channel'>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (fix: GpsState) => {
    setLoading(true);
    const res = await getMyNearbyCustomers(fix);
    if (res.ok) { setNearby(res.data.nearby); setAssigned(res.data.assigned); setProgress(res.data.progress); setRadiusM(res.data.radiusM); }
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
    // City/Channel start EMPTY — the rep must pick new values from the admin catalog (FV-4d).
    // The customer's imported city/channel are shown as "current (old)" only.
    setForm({ city: '', channel: '', phone: c.phone ?? '', notes: '' });
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

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-md space-y-4 p-4">
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-card p-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
          <p className="text-xl font-extrabold text-emerald-800">{t('rpVerify.doneTitle')}</p>
          <p className="text-sm text-emerald-700">{t('rpVerify.doneSub', { name: sel?.name ?? '' })}</p>
        </div>
        <ProgressCard t={t} progress={progress} />
        <button onClick={() => { setSel(null); setPhase('list'); }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground active:scale-[0.99]">
          {t('rpVerify.backToList')} <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </button>
      </div>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  if (phase === 'form' && sel) {
    const oldCity = sel.city ?? '—', oldChannel = sel.channel ?? '—';
    // Honest range indicator: a customer opened from the Assigned list may be outside the
    // radius. Submit is unchanged (server enforces the radius), so we flag it here instead
    // of pretending "within range". null = unknown (no GPS distance yet).
    const selWithin = sel.distanceM == null ? null : sel.distanceM <= radiusM;
    return (
      <div className="mx-auto max-w-md space-y-3 p-4 pb-44 lg:pb-28">
        <button onClick={() => setPhase('list')} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" /> {t('rpVerify.back')}
        </button>

        {/* customer header */}
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold">{sel.name}</p>
              <p className="text-xs text-muted-foreground">{sel.code ?? ''}</p>
            </div>
            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold',
              selWithin === false ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
              <Crosshair className="h-3.5 w-3.5" />{t(selWithin === false ? 'rpVerify.outsideRange' : 'rpVerify.withinRange')}
            </span>
          </div>
          {sel.distanceM != null && <p className="mt-1 text-xs font-semibold text-primary">{t('rpVerify.metersAway', { n: sel.distanceM })}</p>}
          {selWithin === false && <p className="mt-1 text-[11px] font-medium text-amber-700">{t('rpVerify.mustBeWithin', { n: radiusM })}</p>}
        </div>

        {/* current (old) values — read-only */}
        <div className="rounded-2xl border bg-muted/30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('rpVerify.currentInfo')}</p>
          <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">{t('rpVerify.city')}: </span><span className="font-semibold">{oldCity}</span></div>
            <div><span className="text-muted-foreground">{t('rpVerify.channel')}: </span><span className="font-semibold">{oldChannel}</span></div>
          </div>
        </div>

        {/* new City / Channel via bottom-sheet pickers (admin catalog) */}
        <PickerField label={t('rpVerify.cityNew')} required value={form.city} placeholder={t('rpVerify.choose')} onOpen={() => setSheet('city')} />
        <PickerField label={t('rpVerify.channelNew')} required value={form.channel} placeholder={t('rpVerify.choose')} onOpen={() => setSheet('channel')} />

        <Field label={t('rpVerify.outsidePhoto')} required>
          <PhotoInput files={outside ? [outside] : []} onChange={(fs) => setOutside(fs[0] ?? null)} label={t('rpVerify.takePhoto')} />
        </Field>
        <Field label={t('rpVerify.insidePhotos')}>
          <PhotoInput multiple files={inside} onChange={setInside} label={t('rpVerify.addPhotos')} />
        </Field>

        <Field label={t('rpVerify.phone')}>
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" className="h-12 w-full bg-transparent text-base outline-none" />
          </div>
        </Field>
        <Field label={t('rpVerify.notes')}>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-xl border bg-background px-3 py-2 text-base" />
        </Field>

        {err && <p className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</p>}

        {/* Submit bar: above the mobile bottom nav (z-50 > nav z-40), pushed up by the nav
            height + safe area on mobile; on desktop (no bottom nav) it sits at bottom-0 with
            safe-area padding. Keeps Submit clearly tappable, never hidden behind the nav/bar. */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-3 backdrop-blur max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <button onClick={() => void onSubmit()} disabled={submitting}
            className="mx-auto flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60 active:scale-[0.99]">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            {submitting ? t('rpVerify.submitting') : t('rpVerify.submit')}
          </button>
        </div>

        {sheet && (
          <OptionSheet
            title={sheet === 'city' ? t('rpVerify.selectCity') : t('rpVerify.selectChannel')}
            options={sheet === 'city' ? config.cities : config.channels}
            selected={sheet === 'city' ? form.city : form.channel}
            emptyText={t('rpVerify.catalogEmpty')}
            onPick={(v) => { setForm((f) => ({ ...f, [sheet]: v })); setSheet(null); }}
            onClose={() => setSheet(null)}
          />
        )}
      </div>
    );
  }

  // ── LIST ───────────────────────────────────────────────────────────────────
  const filteredAssigned = filterAssignedCustomers(assigned, query);
  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold">{t('rpVerify.title')}</h1>
        <button onClick={requestGps} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold active:scale-95">
          <RefreshCw className="h-3.5 w-3.5" /> {t('rpVerify.refresh')}
        </button>
      </div>

      <ProgressCard t={t} progress={progress} />

      {/* Two ways to pick a customer: GPS "Nearby", or the full "Assigned list" + search. */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border bg-muted/30 p-1">
        {(['nearby', 'assigned'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('h-9 rounded-xl text-sm font-bold transition-colors',
              tab === k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground')}
            aria-pressed={tab === k}
          >
            {t(k === 'nearby' ? 'rpVerify.tabNearby' : 'rpVerify.tabAssigned')}
          </button>
        ))}
      </div>

      {tab === 'nearby' ? (
        <>
          {/* radius banner (stylized "within range" visual — no map dependency) */}
          <RadiusBanner t={t} radiusM={radiusM} count={gps ? nearby.length : null} />

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
              {/* Same single source of truth as the header banner + the server filter:
                  the company-configured radiusM (getCompanyRadiusM), never a hardcoded value. */}
              <p className="text-sm font-semibold">{t('rpVerify.emptyTitle', { n: radiusM })}</p>
              <p className="text-xs text-muted-foreground">{t('rpVerify.emptySub')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {nearby.map((c) => <li key={c.id}><CustomerRow t={t} c={c} onOpen={() => openForm(c)} /></li>)}
            </ul>
          )}
        </>
      ) : (
        <>
          {/* Assigned list + search (code / name / city / channel). Manual open is allowed
              for any assigned customer; the submit screen still enforces the radius. */}
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('rpVerify.searchPlaceholder')}
              className="h-11 w-full bg-transparent text-base outline-none"
              aria-label={t('rpVerify.searchPlaceholder')}
            />
            {query && <button onClick={() => setQuery('')} aria-label={t('common.close')}><X className="h-4 w-4 text-muted-foreground" /></button>}
          </div>
          <p className="px-1 text-[11px] text-muted-foreground">{t('rpVerify.assignedCount', { n: assigned.length })}</p>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t('rpVerify.locating')}</div>
          ) : assigned.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border bg-muted/30 p-8 text-center">
              <Store className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-semibold">{t('rpVerify.assignedEmpty')}</p>
            </div>
          ) : filteredAssigned.length === 0 ? (
            <p className="rounded-2xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">{t('rpVerify.noMatches')}</p>
          ) : (
            <ul className="space-y-2">
              {filteredAssigned.map((c) => <li key={c.id}><CustomerRow t={t} c={c} onOpen={() => openForm(c)} /></li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** One tappable customer row (shared by the Nearby + Assigned lists). */
function CustomerRow({ t, c, onOpen }: { t: (k: string, p?: Record<string, string | number>) => string; c: NearbyCustomer; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border bg-card p-3.5 text-start shadow-sm active:scale-[0.99]">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Store className="h-6 w-6" /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold">{c.name}</p>
          {c.code && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{c.code}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          {c.distanceM != null && <span className="font-semibold text-primary">{t('rpVerify.metersAway', { n: c.distanceM })}</span>}
          {c.city && <span>· {c.city}</span>}
          {c.channel && <span>· {c.channel}</span>}
        </div>
      </div>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{t('rpVerify.statusPending')}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
      </span>
    </button>
  );
}

// ── pieces ─────────────────────────────────────────────────────────────────────
function RadiusBanner({ t, radiusM, count }: { t: (k: string, p?: Record<string, string | number>) => string; radiusM: number; count: number | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-4">
      <div className="flex items-center gap-3">
        {/* concentric radius rings + center pin */}
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <span className="absolute inset-2 rounded-full border-2 border-primary/30" />
          <span className="absolute inset-4 rounded-full border-2 border-primary/50" />
          <MapPin className="relative h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold">{t('rpVerify.showingWithin', { n: radiusM })}</p>
          {count != null && <p className="text-xs text-muted-foreground">{t('rpVerify.nearbyCount', { n: count })}</p>}
        </div>
      </div>
    </div>
  );
}

function ProgressCard({ t, progress }: { t: (k: string, p?: Record<string, string | number>) => string; progress: MyProgress }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold">{t('rpVerify.progress')}</span>
        <span className="text-2xl font-extrabold tabular-nums text-primary">{progress.pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.pct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {([['total', progress.total], ['completed', progress.completed], ['remaining', progress.remaining]] as const).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-muted/50 py-2">
            <p className="text-lg font-bold tabular-nums">{v}</p>
            <p className="text-[11px] text-muted-foreground">{t(`rpVerify.${k}` as 'rpVerify.total')}</p>
          </div>
        ))}
      </div>
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

/** A tap-to-open field that shows the chosen value or a placeholder; opens a bottom sheet. */
function PickerField({ label, required, value, placeholder, onOpen }: { label: string; required?: boolean; value: string; placeholder: string; onOpen: () => void }) {
  return (
    <Field label={label} required={required}>
      <button type="button" onClick={onOpen}
        className="flex h-12 w-full items-center justify-between rounded-xl border bg-background px-3 text-start text-base active:scale-[0.99]">
        <span className={value ? 'font-semibold' : 'text-muted-foreground'}>{value || placeholder}</span>
        <ChevronLeft className="h-4 w-4 -rotate-90 text-muted-foreground" />
      </button>
    </Field>
  );
}

/** Bottom-sheet single-select (City / Channel) sourced from the admin catalog. */
function OptionSheet({ title, options, selected, emptyText, onPick, onClose }: {
  title: string; options: string[]; selected: string; emptyText: string; onPick: (v: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative max-h-[70vh] overflow-y-auto rounded-t-3xl border-t bg-card p-4">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
        <div className="mb-2 flex items-center justify-between">
          <p className="text-base font-bold">{title}</p>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        {options.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="space-y-1 pb-4">
            {options.map((o) => (
              <li key={o}>
                <button onClick={() => onPick(o)}
                  className={`flex h-12 w-full items-center justify-between rounded-xl border px-3 text-start text-base active:scale-[0.99] ${o === selected ? 'border-primary bg-primary/5 font-bold' : ''}`}>
                  {o}{o === selected && <Check className="h-5 w-5 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
