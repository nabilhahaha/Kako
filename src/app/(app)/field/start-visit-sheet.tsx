'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Crosshair, Loader2, CheckCircle2, Camera, X, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { haversineMeters, geofenceStatus, needsExceptionPhoto, type GeofenceStatus } from '@/lib/erp/geo';

export interface FeSettings { radiusM: number; mode: 'advisory' | 'blocking'; photoThresholdM: number }
export interface SheetCustomer { id: string; name: string; lat: number | null; lng: number | null }
export interface StartPayload { lat: number; lng: number; accuracy: number; reason: string | null; photoMarker: string | null; photoBlob: Blob | null; geoStatus: GeofenceStatus; distanceM: number | null }

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

/** Shared GPS-capture + geofence + reason/photo + confirm flow. Presentational:
 *  the parent owns the outbox (passes `onSubmit`). Used by My Visits and My Route. */
export function StartVisitSheet({ customer, settings, online, busy, onClose, onSubmit }: {
  customer: SheetCustomer | null; settings: FeSettings; online: boolean; busy: boolean;
  onClose: () => void; onSubmit: (p: StartPayload) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  if (!customer) return null;

  const distance = gps ? haversineMeters(gps.lat, gps.lng, customer.lat, customer.lng) : null;
  const gstatus = geofenceStatus(distance, settings.radiusM);
  const needPhoto = needsExceptionPhoto(gstatus, distance, settings.mode, settings.photoThresholdM);
  const canConfirm = !!gps && (gstatus !== 'violation' || (reason.trim().length > 0 && (!needPhoto || !!photo)));

  function reset() { setGps(null); setReason(''); setPhoto(null); }
  async function capture() {
    setGpsBusy(true);
    try { setGps(await getPosition()); } catch { toast.error(t('field.visits.gpsError')); } finally { setGpsBusy(false); }
  }
  async function confirm() {
    if (!gps) return;
    await onSubmit({
      lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy,
      reason: gstatus === 'violation' ? reason.trim() : null,
      photoMarker: photo ? `local:${Date.now()}` : null, photoBlob: photo,
      geoStatus: gstatus, distanceM: distance,
    });
    reset();
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="truncate font-semibold">{customer.name}</h2>
        <Button size="icon" variant="ghost" onClick={() => { reset(); onClose(); }}><X className="h-5 w-5" /></Button>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Button className="h-14 text-base" variant={gps ? 'outline' : 'default'} disabled={gpsBusy} onClick={capture}>
          {gpsBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
          {gpsBusy ? t('field.visits.capturing') : gps ? t('field.visits.recapture') : t('field.visits.captureGps')}
        </Button>

        {gps && (
          <Card><CardContent className="space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('field.visits.accuracy')}</span><span dir="ltr">±{gps.accuracy} m</span></div>
            {gstatus === 'unknown'
              ? <p className="text-muted-foreground">{t('field.visits.unknownLoc')}</p>
              : <div className="flex items-center justify-between">
                  <span className="font-medium">{Math.round(distance ?? 0)} {t('field.visits.metersFromStore')}</span>
                  {gstatus === 'ok'
                    ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" />{t('field.visits.inside')}</span>
                    : <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" />{t('field.visits.outside')}</span>}
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
          <Button className="h-14 w-full text-base" disabled={!canConfirm || busy} onClick={confirm}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} {t('field.visits.confirm')}
          </Button>
          {!gps && <p className="mt-2 text-center text-xs text-muted-foreground">{t('field.visits.needGps')}</p>}
        </div>
      </div>
    </div>
  );
}
