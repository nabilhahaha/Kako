'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { MapPin, Loader2, CheckCircle2, X, Clock, AlertTriangle, Plus, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { useFieldSync } from '@/lib/erp/use-field-sync';
import type { GeofenceStatus } from '@/lib/erp/geo';
import { FieldSyncStatus } from '@/components/field/sync-status';
import { StartVisitSheet, type StartPayload, type FeSettings } from '../start-visit-sheet';

export type { FeSettings } from '../start-visit-sheet';

export interface ServerVisit {
  id: string; clientRef: string | null; customerId: string; customerName: string;
  status: 'planned' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  checkinAt: string | null; checkoutAt: string | null; geofenceStatus: string | null; distanceM: number | null; durationMin: number | null;
}
export interface PickCustomer { id: string; name: string; code: string | null; lat: number | null; lng: number | null }

interface LocalVisit { clientRef: string; customerId: string; customerName: string; status: 'in_progress' | 'completed'; checkinAt: string; geofenceStatus: GeofenceStatus; distanceM: number | null; durationMin: number | null }
interface Row { key: string; clientRef: string | null; visitId: string | null; customerId: string; customerName: string; status: string; checkinAt: string | null; geofenceStatus: string | null; distanceM: number | null; durationMin: number | null; pending: boolean }

function minutesSince(iso: string): number { return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); }
function getPos(): Promise<{ lat: number; lng: number }> {
  return new Promise((res) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return res({} as { lat: number; lng: number });
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({} as { lat: number; lng: number }), { enableHighAccuracy: true, timeout: 15_000 });
  });
}

export function VisitsClient({ visits, customers, settings }: { visits: ServerVisit[]; customers: PickCustomer[]; settings: FeSettings }) {
  const { t } = useI18n();
  const { online, enqueueStart, enqueueEnd } = useFieldSync();
  const [local, setLocal] = useState<Record<string, LocalVisit>>({});
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PickCustomer | null>(null);
  const [busy, setBusy] = useState(false);
  const [endingRef, setEndingRef] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const v of visits) {
      const key = v.clientRef ?? v.id;
      map.set(key, { key, clientRef: v.clientRef, visitId: v.id, customerId: v.customerId, customerName: v.customerName, status: v.status, checkinAt: v.checkinAt, geofenceStatus: v.geofenceStatus, distanceM: v.distanceM, durationMin: v.durationMin, pending: false });
    }
    for (const [ref, lv] of Object.entries(local)) {
      map.set(ref, { key: ref, clientRef: ref, visitId: null, customerId: lv.customerId, customerName: lv.customerName, status: lv.status, checkinAt: lv.checkinAt, geofenceStatus: lv.geofenceStatus, distanceM: lv.distanceM, durationMin: lv.durationMin, pending: true });
    }
    const order = (s: string) => (s === 'in_progress' ? 0 : 1);
    return [...map.values()].sort((a, b) => order(a.status) - order(b.status) || (b.checkinAt ?? '').localeCompare(a.checkinAt ?? ''));
  }, [visits, local]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q)) : customers;
  }, [customers, search]);

  async function onStart(p: StartPayload) {
    if (!selected) return;
    setBusy(true);
    try {
      const clientRef = await enqueueStart({ customerId: selected.id, lat: p.lat, lng: p.lng, accuracy: p.accuracy, reason: p.reason, photo: p.photoMarker }, p.photoBlob ?? undefined);
      setLocal((s) => ({ ...s, [clientRef]: { clientRef, customerId: selected.id, customerName: selected.name, status: 'in_progress', checkinAt: new Date().toISOString(), geofenceStatus: p.geoStatus, distanceM: p.distanceM, durationMin: null } }));
      toast.success(t('field.visits.startVisit'));
      setSelected(null);
    } finally { setBusy(false); }
  }

  async function endVisit(row: Row) {
    if (!row.clientRef) return;
    setEndingRef(row.clientRef);
    const pos = await getPos();
    try {
      await enqueueEnd(row.clientRef, pos);
      setLocal((s) => ({ ...s, [row.clientRef!]: { clientRef: row.clientRef!, customerId: row.customerId, customerName: row.customerName, status: 'completed', checkinAt: row.checkinAt ?? new Date().toISOString(), geofenceStatus: (row.geofenceStatus as GeofenceStatus) ?? 'unknown', distanceM: row.distanceM, durationMin: row.checkinAt ? minutesSince(row.checkinAt) : null } }));
      toast.success(t('field.visits.completed'));
    } finally { setEndingRef(null); }
  }

  const geoBadge = (s: string | null) => s === 'violation'
    ? <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{t('field.visits.outside')}</Badge>
    : s === 'ok' ? <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />{t('field.visits.inside')}</Badge> : null;

  return (
    <div className="space-y-3 pb-24">
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
                {r.status === 'in_progress' ? <Badge className="gap-1"><Clock className="h-3 w-3" />{t('field.visits.inProgress')}</Badge> : <Badge variant="secondary">{t('field.visits.completed')}</Badge>}
                {geoBadge(r.geofenceStatus)}
                {r.distanceM != null && <span>{Math.round(r.distanceM)} {t('field.visits.metersFromStore')}</span>}
                {r.status === 'in_progress' && r.checkinAt && <span>· {minutesSince(r.checkinAt)} {t('field.visits.min')} {t('field.visits.elapsed')}</span>}
                {r.status === 'completed' && r.durationMin != null && <span>· {r.durationMin} {t('field.visits.min')}</span>}
                {r.pending && <Badge variant="outline">{t('field.visits.pendingSync')}</Badge>}
              </div>
            </div>
            {r.status === 'in_progress' && (
              <div className="flex shrink-0 items-center gap-2">
                <Link href={`/field/capture?customer=${r.customerId}${r.visitId ? `&visit=${r.visitId}` : ''}`}>
                  <Button size="sm" variant="outline" className="h-11 px-3"><ClipboardList className="h-4 w-4" /></Button>
                </Link>
                <Button size="sm" className="h-11 px-4" disabled={endingRef === r.clientRef} onClick={() => endVisit(r)}>
                  {endingRef === r.clientRef ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('field.visits.endVisit')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t bg-background p-3">
        <Button className="h-14 w-full text-base" onClick={() => setPicking(true)}><Plus className="h-5 w-5" /> {t('field.visits.startVisit')}</Button>
      </div>

      {/* customer picker */}
      {picking && (
        <div className="fixed inset-0 z-30 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="font-semibold">{t('field.visits.pickCustomer')}</h2>
            <Button size="icon" variant="ghost" onClick={() => { setPicking(false); setSearch(''); }}><X className="h-5 w-5" /></Button>
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col p-4">
            <Input autoFocus placeholder={t('field.visits.search')} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 h-12" />
            <div className="-mx-1 flex-1 space-y-1 overflow-y-auto">
              {filtered.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{t('field.visits.empty')}</p>}
              {filtered.map((c) => (
                <button key={c.id} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-start hover:bg-muted active:bg-muted"
                  onClick={() => { setSelected(c); setPicking(false); setSearch(''); }}>
                  <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span>{c.code && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{c.code}</span>}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* capture + geofence + confirm (shared) */}
      <StartVisitSheet customer={selected} settings={settings} online={online} busy={busy} onClose={() => setSelected(null)} onSubmit={onStart} />
    </div>
  );
}
