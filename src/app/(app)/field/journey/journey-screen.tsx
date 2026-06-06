'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  sortJourney,
  distanceMeters,
  type JourneySortMode,
  type LatLng,
} from '@/lib/erp/journey-sort';
import {
  checkInVisit,
  closeDay,
  type JourneyStopRow,
  type TodayJourneyData,
} from '../actions';
import {
  MapPin,
  Navigation,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  Flag,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { submitOffline } from '@/lib/sync/web/submit-offline';

interface CheckInResult {
  visit_id?: string;
  gps_status?: string;
  distance_m?: number;
  radius_m?: number;
  out_of_route?: boolean;
  violation?: boolean;
  blocked?: boolean;
  compliance_id?: string;
}

interface CloseResult {
  close_status?: string;
  planned_count?: number;
  visited_count?: number;
  skipped_count?: number;
  orders_count?: number;
  gps_violation_count?: number;
  out_of_route_count?: number;
  coverage_pct?: number;
}

const SORT_MODES: JourneySortMode[] = ['nearest', 'manual', 'optimized', 'hybrid'];

export function JourneyScreen({
  data,
  canOverrideGps,
}: {
  data: TodayJourneyData;
  canOverrideGps: boolean;
}) {
  const { t, locale } = useI18n();

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationError, setLocationError] = useState(false);
  const [mode, setMode] = useState<JourneySortMode>(data.sortMode);

  // Visited set grows locally as the rep checks in (seeded from the server).
  const [visited, setVisited] = useState<Set<string>>(new Set(data.visited));
  const [busyId, setBusyId] = useState<string | null>(null);
  // Per-stop pending override: holds the check-in result that requires a reason.
  const [blockedStop, setBlockedStop] = useState<{ stop: JourneyStopRow; result: CheckInResult } | null>(null);
  const [reason, setReason] = useState('');

  // End-day modal
  const [closeOpen, setCloseOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null);

  // ── Geolocation (best-effort; falls back to manual order) ──
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocating(false);
      setLocationError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, []);

  const name = (s: JourneyStopRow) =>
    (locale === 'ar' ? s.customer_name_ar || s.customer_name : s.customer_name) || s.customer_code || '—';

  // Order the stops. With no device location, sortJourney gracefully uses the
  // first stop / manual order, so the list never breaks.
  const ordered = useMemo(() => {
    const stops = data.stops.map((s) => ({
      customerId: s.customer_id,
      sequence: s.sequence ?? 0,
      latitude: s.latitude,
      longitude: s.longitude,
    }));
    const sorted = sortJourney(stops, locationError ? 'manual' : mode, origin);
    const byId = new Map(data.stops.map((s) => [s.customer_id, s]));
    return sorted.map((s) => byId.get(s.customerId)!).filter(Boolean);
  }, [data.stops, mode, origin, locationError]);

  const total = data.stops.length;
  const visitedCount = ordered.filter((s) => visited.has(s.customer_id)).length;
  const coverage = total > 0 ? Math.round((visitedCount / total) * 100) : 0;

  async function getDeviceLocation(): Promise<LatLng | null> {
    if (origin) return origin;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setOrigin(loc);
          resolve(loc);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }

  async function doCheckIn(stop: JourneyStopRow, opts: { reason?: string; force?: boolean } = {}) {
    setBusyId(stop.customer_id);
    try {
      const loc = await getDeviceLocation();
      // Visit check-in is offline-queue (hybrid policy): GPS is captured on-device;
      // online → server geofence + journal; offline → queue the check-in and sync later.
      const localId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `local-${Date.now()}`;
      const res = await submitOffline({
        action: () => checkInVisit({
          customerId: stop.customer_id,
          lat: loc?.latitude ?? null,
          lng: loc?.longitude ?? null,
          workSessionId: data.workSessionId,
          reason: opts.reason ?? null,
          force: opts.force ?? false,
        }),
        mutation: (d) => ({
          entity: 'visits', op: 'insert',
          pk: (d as { visit_id?: string } | null)?.visit_id ?? localId,
          payload: {
            customer_id: stop.customer_id, latitude: loc?.latitude ?? null, longitude: loc?.longitude ?? null,
            work_session_id: data.workSessionId, reason: opts.reason ?? null,
            checked_in_at: Date.now(), ...(d ? {} : { offline: true }),
          },
        }),
      });
      if (res.offline) {
        // Captured locally; the server will validate geofence/route on sync.
        setVisited((prev) => new Set(prev).add(stop.customer_id));
        toast.success(t('common.offlineSaved'));
        return;
      }
      if (!res.ok) {
        toast.error(res.error || t('fmcg.error'));
        return;
      }
      const result = (res.data ?? {}) as CheckInResult;

      if (result.blocked) {
        // Needs a reason (+ optional override) before it counts.
        setBlockedStop({ stop, result });
        setReason(opts.reason ?? '');
        if (result.violation && result.distance_m != null && result.radius_m != null) {
          toast.warning(
            t('fmcg.gpsViolationDistance', {
              distance: Math.round(result.distance_m),
              radius: Math.round(result.radius_m),
            }),
          );
        } else if (result.out_of_route) {
          toast.warning(t('fmcg.outOfRoute'));
        }
        return;
      }

      // Success (possibly with a logged exception that is not blocking).
      setVisited((prev) => new Set(prev).add(stop.customer_id));
      setBlockedStop(null);
      setReason('');
      if (result.violation && result.distance_m != null && result.radius_m != null) {
        toast.success(
          `${t('fmcg.checkedIn')} · ${t('fmcg.gpsViolationDistance', {
            distance: Math.round(result.distance_m),
            radius: Math.round(result.radius_m),
          })}`,
        );
      } else if (result.out_of_route) {
        toast.success(`${t('fmcg.checkedIn')} · ${t('fmcg.outOfRoute')}`);
      } else {
        toast.success(t('fmcg.checkInOk'));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function submitBlocked(force: boolean) {
    if (!blockedStop) return;
    if (!reason.trim()) {
      toast.error(t('fmcg.reasonRequired'));
      return;
    }
    await doCheckIn(blockedStop.stop, { reason: reason.trim(), force });
  }

  async function doCloseDay() {
    setClosing(true);
    try {
      const res = await closeDay(data.workSessionId, [], bulkReason.trim() || undefined);
      if (!res.ok) {
        toast.error(res.error || t('fmcg.error'));
        return;
      }
      const result = (res.data ?? {}) as CloseResult;
      setCloseResult(result);
      if (result.close_status === 'pending_approval') {
        toast.warning(t('fmcg.pendingApproval'));
      } else {
        toast.success(t('fmcg.closedOk'));
      }
    } finally {
      setClosing(false);
    }
  }

  const distanceBadge = (stop: JourneyStopRow) => {
    if (!origin || stop.latitude == null || stop.longitude == null) return null;
    const d = distanceMeters(origin, { latitude: stop.latitude, longitude: stop.longitude });
    if (!isFinite(d)) return null;
    const label = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`;
    return (
      <Badge variant="secondary" className="gap-1" dir="ltr">
        <Navigation className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  return (
    <div className="mx-auto max-w-2xl pb-28">
      {/* Header + coverage */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t('fmcg.journeyTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('fmcg.journeyDescription')}</p>
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {visitedCount}
                <span className="text-base font-normal text-muted-foreground"> / {total}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t('fmcg.visited')} · {total} {t('fmcg.stops')}
              </div>
            </div>
            <Badge variant={coverage >= 80 ? 'success' : coverage >= 50 ? 'warning' : 'secondary'}>
              {t('fmcg.coverage')} {coverage}%
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select
              className="h-9 w-auto"
              value={locationError ? 'manual' : mode}
              disabled={locationError}
              onChange={(e) => setMode(e.target.value as JourneySortMode)}
              aria-label={t('fmcg.sortMode')}
            >
              {SORT_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`fmcg.sort${m.charAt(0).toUpperCase()}${m.slice(1)}`)}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {locating && (
        <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('fmcg.locating')}
        </p>
      )}
      {locationError && (
        <p className="mb-3 flex items-center gap-2 text-sm text-warning">
          <AlertTriangle className="h-4 w-4" /> {t('fmcg.locationOff')}
        </p>
      )}

      {/* Stop list */}
      {ordered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('fmcg.noStops')}</CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {ordered.map((stop, idx) => {
            const isVisited = visited.has(stop.customer_id);
            const isBlocked = blockedStop?.stop.customer_id === stop.customer_id;
            return (
              <li key={stop.customer_id}>
                <Card className={isVisited ? 'opacity-70' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums">
                            {idx + 1}
                          </span>
                          <span className="truncate font-semibold">{name(stop)}</span>
                          {isVisited && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {stop.sequence > 0 && (
                            <span>
                              {t('fmcg.sequence')} {stop.sequence}
                            </span>
                          )}
                          {distanceBadge(stop)}
                          {stop.address && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{stop.address}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      {stop.phone && (
                        <a href={`tel:${stop.phone}`}>
                          <Button variant="ghost" size="icon" aria-label={t('fmcg.call')}>
                            <Phone className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>

                    {/* Primary action: Check in */}
                    {!isBlocked ? (
                      <Button
                        className="mt-3 w-full"
                        disabled={busyId === stop.customer_id || isVisited}
                        onClick={() => doCheckIn(stop)}
                      >
                        {busyId === stop.customer_id ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> {t('fmcg.checkingIn')}
                          </>
                        ) : isVisited ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> {t('fmcg.checkedIn')}
                          </>
                        ) : (
                          <>
                            <MapPin className="h-4 w-4" /> {t('fmcg.checkIn')}
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warning">
                          <ShieldAlert className="h-4 w-4" />
                          {blockedStop!.result.violation ? t('fmcg.gpsViolation') : t('fmcg.outOfRoute')}
                          {blockedStop!.result.distance_m != null && blockedStop!.result.radius_m != null && (
                            <span className="font-normal text-muted-foreground">
                              {t('fmcg.gpsViolationDistance', {
                                distance: Math.round(blockedStop!.result.distance_m),
                                radius: Math.round(blockedStop!.result.radius_m),
                              })}
                            </span>
                          )}
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">{t('fmcg.reasonPrompt')}</p>
                        <Input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={t('fmcg.reasonPlaceholder')}
                          className="mb-2"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={busyId === stop.customer_id}
                            onClick={() => submitBlocked(false)}
                          >
                            {t('fmcg.submitReason')}
                          </Button>
                          {canOverrideGps && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busyId === stop.customer_id}
                              onClick={() => submitBlocked(true)}
                            >
                              {t('fmcg.forceOverride')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setBlockedStop(null);
                              setReason('');
                            }}
                          >
                            {t('fmcg.cancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sticky End Day primary action */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button className="w-full" size="lg" variant="default" onClick={() => setCloseOpen(true)}>
            <Flag className="h-4 w-4" /> {t('fmcg.endDay')}
          </Button>
        </div>
      </div>

      {/* End Day summary modal */}
      {closeOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <Card className="w-full max-w-md rounded-b-none sm:rounded-b-lg">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">{t('fmcg.closeDayTitle')}</h2>
                <Button variant="ghost" size="icon" onClick={() => setCloseOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {!closeResult ? (
                <>
                  <p className="mb-3 text-sm text-muted-foreground">{t('fmcg.closeDaySummary')}</p>
                  <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                    <Summary label={t('fmcg.planned')} value={total} />
                    <Summary label={t('fmcg.visited')} value={visitedCount} />
                    <Summary label={t('fmcg.skipped')} value={Math.max(total - visitedCount, 0)} />
                    <Summary label={t('fmcg.coverage')} value={`${coverage}%`} />
                  </div>
                  {total - visitedCount > 0 && (
                    <div className="mb-4">
                      <label className="mb-1 block text-sm font-medium">{t('fmcg.bulkReason')}</label>
                      <Input
                        value={bulkReason}
                        onChange={(e) => setBulkReason(e.target.value)}
                        placeholder={t('fmcg.reasonPlaceholder')}
                      />
                    </div>
                  )}
                  <Button className="w-full" size="lg" disabled={closing} onClick={doCloseDay}>
                    {closing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> {t('fmcg.closing')}
                      </>
                    ) : (
                      t('fmcg.confirmEndDay')
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                    <Summary label={t('fmcg.planned')} value={closeResult.planned_count ?? 0} />
                    <Summary label={t('fmcg.visited')} value={closeResult.visited_count ?? 0} />
                    <Summary label={t('fmcg.skipped')} value={closeResult.skipped_count ?? 0} />
                    <Summary label={t('fmcg.orders')} value={closeResult.orders_count ?? 0} />
                    <Summary label={t('fmcg.violations')} value={closeResult.gps_violation_count ?? 0} />
                    <Summary label={t('fmcg.outOfRouteCount')} value={closeResult.out_of_route_count ?? 0} />
                    <Summary label={t('fmcg.coverage')} value={`${closeResult.coverage_pct ?? 0}%`} />
                  </div>
                  <Badge
                    variant={closeResult.close_status === 'closed' ? 'success' : 'warning'}
                    className="mb-3"
                  >
                    {closeResult.close_status === 'closed' ? t('fmcg.closedOk') : t('fmcg.pendingApproval')}
                  </Badge>
                  <Button className="w-full" variant="outline" onClick={() => setCloseOpen(false)}>
                    {t('fmcg.cancel')}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-secondary/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
