'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Crosshair, Loader2, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { useFieldSync } from '@/lib/erp/use-field-sync';
import { haversineMeters } from '@/lib/erp/geo';
import { FieldSyncStatus } from '@/components/field/sync-status';
import { StartVisitSheet, type StartPayload, type FeSettings, type SheetCustomer } from '../start-visit-sheet';

export interface RouteStop {
  id: string; seq: number; status: 'planned' | 'visited' | 'missed' | 'skipped';
  priority: string; customerId: string; customerName: string; lat: number | null; lng: number | null;
}

export function RouteClient({ stops, settings, routeId, offPlanCount }: { stops: RouteStop[]; settings: FeSettings; routeId: string | null; offPlanCount: number }) {
  const { t } = useI18n();
  const { online, enqueueStart } = useFieldSync();
  const [done, setDone] = useState<Record<string, true>>({});      // optimistic visited (this session)
  const [selected, setSelected] = useState<SheetCustomer | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const effStatus = (s: RouteStop) => (done[s.id] ? 'visited' : s.status);
  const metrics = useMemo(() => {
    const planned = stops.length;
    const visited = stops.filter((s) => effStatus(s) === 'visited').length;
    const missed = stops.filter((s) => effStatus(s) === 'missed').length;
    return { planned, visited, missed, remaining: Math.max(0, planned - visited - missed), coverage: planned > 0 ? Math.round((visited / planned) * 100) : 0 };
  }, [stops, done]);

  async function locate() {
    setLocating(true);
    try {
      const p = await new Promise<{ lat: number; lng: number }>((res, rej) => navigator.geolocation.getCurrentPosition((x) => res({ lat: x.coords.latitude, lng: x.coords.longitude }), rej, { enableHighAccuracy: true, timeout: 15_000 }));
      setHere(p);
    } catch { toast.error(t('field.visits.gpsError')); } finally { setLocating(false); }
  }

  async function onStart(p: StartPayload) {
    if (!selected) return;
    setBusy(true);
    try {
      await enqueueStart({ customerId: selected.id, lat: p.lat, lng: p.lng, accuracy: p.accuracy, reason: p.reason, photo: p.photoMarker, routeId }, p.photoBlob ?? undefined);
      if (selectedStop) setDone((d) => ({ ...d, [selectedStop]: true }));
      toast.success(t('field.visits.startVisit'));
      setSelected(null); setSelectedStop(null);
    } finally { setBusy(false); }
  }

  const Kpi = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded-md border p-2 text-center"><p className="text-lg font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>
  );
  const statusBadge = (s: RouteStop) => {
    const st = effStatus(s);
    if (st === 'visited') return <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />{t('field.route.visited')}</Badge>;
    if (st === 'missed') return <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{t('field.route.missed')}</Badge>;
    return <Badge variant="outline">{t('field.route.pending')}</Badge>;
  };

  return (
    <div className="space-y-3 pb-6">
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
        <h1 className="mb-1 text-lg font-semibold">{t('field.route.title')}</h1>
        <FieldSyncStatus />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Kpi label={t('field.route.planned')} value={metrics.planned} />
        <Kpi label={t('field.route.visited')} value={metrics.visited} />
        <Kpi label={t('field.route.remaining')} value={metrics.remaining} />
        <Kpi label={t('field.route.coverage')} value={`${metrics.coverage}%`} />
      </div>

      <Button variant="outline" className="h-11 w-full" disabled={locating} onClick={locate}>
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} {t('field.route.locate')}
      </Button>

      {offPlanCount > 0 && <p className="text-center text-xs text-muted-foreground">{t('field.route.offPlan')}: {offPlanCount}</p>}

      {stops.map((s) => {
        const dist = here ? haversineMeters(here.lat, here.lng, s.lat, s.lng) : null;
        const st = effStatus(s);
        return (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="px-1.5">{s.priority}</Badge>
                  <Link href={`/field/customers/${s.customerId}`} className="truncate font-medium hover:underline">{s.customerName}</Link>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {statusBadge(s)}
                  {dist != null && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{Math.round(dist)} {t('field.visits.metersFromStore')}</span>}
                </div>
              </div>
              {st === 'planned' && (
                <Button size="sm" className="h-11 shrink-0 px-4" onClick={() => { setSelected({ id: s.customerId, name: s.customerName, lat: s.lat, lng: s.lng }); setSelectedStop(s.id); }}>
                  {t('field.route.start')}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <StartVisitSheet customer={selected} settings={settings} online={online} busy={busy} onClose={() => { setSelected(null); setSelectedStop(null); }} onSubmit={onStart} />
    </div>
  );
}
