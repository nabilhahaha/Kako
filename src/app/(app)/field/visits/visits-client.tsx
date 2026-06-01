'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { MapPin, Crosshair, Loader2, CheckCircle2, Camera, X, Clock, AlertTriangle, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { useFieldSync } from '@/lib/erp/use-field-sync';
import { haversineMeters, geofenceStatus, needsExceptionPhoto, type GeofenceStatus } from '@/lib/erp/geo';
import { FieldSyncStatus } from '@/components/field/sync-status';

export interface ServerVisit {
  id: string; clientRef: string | null; customerId: string; customerName: string;
  status: 'planned' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  checkinAt: string | null; checkoutAt: string | null; geofenceStatus: string | null; distanceM: number | null; durationMin: number | null;
}
export interface PickCustomer { id: string; name: string; code: string | null; lat: number | null; lng: number | null }
export interface FeSettings { radiusM: number; mode: 'advisory' | 'blocking'; photoThresholdM: number }

interface LocalVisit {
  clientRef: string; customerId: string; customerName: string; status: 'in_progress' | 'completed';
  checkinAt: string; geofenceStatus: GeofenceStatus; distanceM: number | null; durationMin: number | null;
}
interface Row {
  key: string; clientRef: string | null; customerId: string; customerName: string; status: string;
  checkinAt: string | null; geofenceStatus: string | null; distanceM: number | null; durationMin: number | null; pending: boolean;
}

function getPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

function minutesSince(iso: string): number { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); }

export function VisitsClient({ visits, customers, settings }: { visits: ServerVisit[]; customers: PickCustomer[]; settings: FeSettings }) {
  const { t } = useI18n();
  const { online, enqueueStart, enqueueEnd } = useFieldSync();
  const [local, setLocal] = useState<Record<string, LocalVisit>>({});
  const [sheet, setSheet] = useState<null | 'pick' | 'capture'>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PickCustomer | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [endingRef, setEndingRef] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  // ── merged list: server rows, overlaid by this session's local intent ──
  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const v of visits) {
      const key = v.clientRef ?? v.id;
      map.set(key, { key, clientRef: v.clientRef, customerId: v.customerId, customerName: v.customerName, status: v.status, checkinAt: v.checkinAt, geofenceStatus: v.geofenceStatus, distanceM: v.distanceM, durationMin: v.durationMin, pending: false });
    }
    for (const [ref, lv] of Object.entries(local)) {
      map.set(ref, { key: ref, clientRef: ref, customerId: lv.customerId, customerName: lv.customerName, status: lv.status, checkinAt: lv.checkinAt, geofenceStatus: lv.geofenceStatus, distanceM: lv.distanceM, durationMin: lv.durationMin, pending: true });
    }
    const order = (s: string) => (s === 'in_progress' ? 0 : 1);
    return [...map.values()].sort((a, b) => order(a.status) - order(b.status) || (b.checkinAt ?? '').localeCompare(a.checkinAt ?? ''));
  }, [visits, local]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q)) : customers;
  }, [customers, search]);

  // ── geofence evaluation for the capture sheet ──
  const distance = gps && selected ? haversineMeters(gps.lat, gps.lng, selected.lat, selected.lng) : null;
  const gstatus = geofenceStatus(distance, settings.radiusM);
  const needPhoto = needsExceptionPhoto(gstatus, distance, settings.mode, settings.photoThresholdM);
  const canConfirm = !!gps && (gstatus !== 'violation' || (reason.trim().length > 0 && (!needPhoto || !!photo)));

  function resetSheet() { setSheet(null); setSelected(null); setGps(null); setReason(''); setPhoto(null); setSearch(''); }

  async function capture() {
    setGpsBusy(true);
    try { setGps(await getPosition()); }
    catch { toast.error(t('field.visits.gpsError')); }
    finally { setGpsBusy(false); }
  }

  async function confirmStart() {
    if (!selected || !gps) return;
    setBusy(true);
    try {
      const clientRef = await enqueueStart(
        { customerId: selected.id, lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy, reason: gstatus === 'violation' ? reason.trim() : null, photo: photo ? `local:${Date.now()}` : null },
        photo ?? undefined,
      );
      setLocal((p) => ({ ...p, [clientRef]: { clientRef, customerId: selected.id, customerName: selected.name, status: 'in_progress', checkinAt: new Date().toISOString(), geofenceStatus: gstatus, distanceM: distance, durationMin: null } }));
      toast.success(t('field.visits.startVisit'));
      resetSheet();
    } finally { setBusy(false); }
  }

  async function endVisit(row: Row) {
    if (!row.clientRef) return;
    setEndingRef(row.clientRef);
    let pos: { lat: number; lng: number } = {} as { lat: number; lng: number };
    try { const p = await getPosition(); pos = { lat: p.lat, lng: p.lng }; } catch { /* end even without GPS */ }
    try {
      await enqueueEnd(row.clientRef, pos);
      setLocal((p) => ({ ...p, [row.clientRef!]: { clientRef: row.clientRef!, customerId: row.customerId, customerName: row.customerName, status: 'completed', checkinAt: row.checkinAt ?? new Date().toISOString(), geofenceStatus: (row.geofenceStatus as GeofenceStatus) ?? 'unknown', distanceM: row.distanceM, durationMin: row.checkinAt ? minutesSince(row.checkinAt) : null } }));
      toast.success(t('field.visits.completed'));
    } finally { setEndingRef(null); }
  }

  const geoBadge = (s: string | null) => s === 'violation'
    ? <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{t('field.visits.outside')}</Badge>
    : s === 'ok' ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />{t('field.visits.inside')}</Badge> : null;

  return (
    <div className="space-y-3 pb-24">
      {/* sticky header */}
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
        <h1 className="mb-1 text-lg font-semibold">{t('field.visits.title')}</h1>
        <FieldSyncStatus />
      </div>

      {rows.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.visits.noVisits')}</CardContent></Card>}

      {rows.map((r) => (
        <Card key={r.key}>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link href={`/field/customers/${r.customerId}`} className="block truncate font-medium hover:underline">{r.customerName}</Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {r.status === 'in_progress'
                  ? <Badge className="gap-1"><Clock className="h-3 w-3" />{t('field.visits.inProgress')}</Badge>
                  : <Badge variant="secondary">{t('field.visits.completed')}</Badge>}
                {geoBadge(r.geofenceStatus)}
                {r.distanceM != null && <span>{Math.round(r.distanceM)} {t('field.visits.metersFromStore')}</span>}
                {r.status === 'in_progress' && r.checkinAt && <span>· {minutesSince(r.checkinAt)} {t('field.visits.min')} {t('field.visits.elapsed')}</span>}
                {r.status === 'completed' && r.durationMin != null && <span>· {r.durationMin} {t('field.visits.min')}</span>}
                {r.pending && <Badge variant="outline">{t('field.visits.pendingSync')}</Badge>}
              </div>
            </div>
            {r.status === 'in_progress' && (
              <Button size="sm" className="h-11 shrink-0 px-4" disabled={endingRef === r.clientRef} onClick={() => endVisit(r)}>
                {endingRef === r.clientRef ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('field.visits.endVisit')}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      {/* sticky primary action — one tap, thumb-reachable */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t bg-background p-3">
        <Button className="h-14 w-full text-base" onClick={() => setSheet('pick')}>
          <Plus className="h-5 w-5" /> {t('field.visits.startVisit')}
        </Button>
      </div>

      {/* ── start flow sheet ── */}
      {sheet && (
        <div className="fixed inset-0 z-30 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-semibold">{sheet === 'pick' ? t('field.visits.pickCustomer') : selected?.name}</h2>
            <Button size="icon" variant="ghost" onClick={resetSheet}><X className="h-5 w-5" /></Button>
          </div>

          {sheet === 'pick' && (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <Input autoFocus placeholder={t('field.visits.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 h-12" />
              <div className="-mx-1 flex-1 space-y-1 overflow-y-auto">
                {filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t('field.visits.empty')}</p>}
                {filtered.map((c) => (
                  <button key={c.id} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-start hover:bg-muted active:bg-muted"
                    onClick={() => { setSelected(c); setGps(null); setReason(''); setPhoto(null); setSheet('capture'); }}>
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span>{c.code && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{c.code}</span>}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sheet === 'capture' && selected && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <Button className="h-14 text-base" variant={gps ? 'outline' : 'default'} disabled={gpsBusy} onClick={capture}>
                {gpsBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
                {gpsBusy ? t('field.visits.capturing') : gps ? t('field.visits.recapture') : t('field.visits.captureGps')}
              </Button>

              {gps && (
                <Card><CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t('field.visits.accuracy')}</span><span dir="ltr">±{gps.accuracy} m</span>
                  </div>
                  {gstatus === 'unknown'
                    ? <p className="text-muted-foreground">{t('field.visits.unknownLoc')}</p>
                    : <div className="flex items-center justify-between">
                        <span className="font-medium">{Math.round(distance ?? 0)} {t('field.visits.metersFromStore')}</span>
                        {gstatus === 'ok'
                          ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />{t('field.visits.inside')}</Badge>
                          : <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{t('field.visits.outside')}</Badge>}
                      </div>}
                </CardContent></Card>
              )}

              {gps && gstatus === 'violation' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">{t('field.visits.reason')}</label>
                    <textarea className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-base" placeholder={t('field.visits.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
                  </div>
                  {needPhoto && (
                    <div>
                      <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                      <Button variant={photo ? 'secondary' : 'outline'} className="h-12 w-full" onClick={() => photoInput.current?.click()}>
                        {photo ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />} {photo ? t('field.visits.photoTaken') : t('field.visits.takePhoto')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-auto pt-2">
                {!online && <p className="mb-2 text-center text-xs text-muted-foreground">{t('field.sync.offline')} — {t('field.sync.queued')}</p>}
                <Button className="h-14 w-full text-base" disabled={!canConfirm || busy} onClick={confirmStart}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} {t('field.visits.confirm')}
                </Button>
                {!gps && <p className="mt-2 text-center text-xs text-muted-foreground">{t('field.visits.needGps')}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
