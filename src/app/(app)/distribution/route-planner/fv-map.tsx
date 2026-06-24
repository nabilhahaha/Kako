'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Navigation, Store, X, CheckCircle2, Clock, Crosshair } from 'lucide-react';
import { haversineMeters } from '@/lib/erp/geo-distance';
import type { TFunc } from '@/lib/i18n';
import { toMapGeoJSON, mapCounts, pointFromProps, type FvMapPoint } from './fv-map-helpers';
import { openGoogleMapsNavigation } from './fv-nav';

/**
 * FV Map tab — the logged-in rep's assigned customers on a mobile map (MapLibre, keyless OSM
 * raster). Green dot = completed/verified, red dot = pending. Every customer is an individual
 * coloured dot (no numbered cluster bubbles) in one GPU circle layer, which stays smooth for
 * large assigned lists. Tapping a dot opens a bottom sheet (code · name · city · channel ·
 * status · distance · last verified) with Open Customer + Navigate — the sheet data is rebuilt
 * from the clicked feature's own properties (reliable at any zoom). Navigation is never
 * radius-gated; submit stays radius + photo gated elsewhere. Read-only — no writes here.
 */
const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

const SRC = 'fv-customers';

export function FvMap({ points, gps, locale, t, onOpenCustomer }: {
  points: FvMapPoint[];
  gps: { lat: number; lng: number } | null;
  locale: string;
  t: TFunc;
  onOpenCustomer: (p: FvMapPoint) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<FvMapPoint | null>(null);
  const counts = mapCounts(points);

  // Init the map once (the parent only mounts this component when the Map tab is open → lazy).
  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: holder.current,
      style: RASTER_STYLE,
      center: [46.7, 24.7],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    if (gps) map.addControl(new maplibregl.GeolocateControl({ showUserLocation: true }), 'top-right');
    mapRef.current = map;
    map.on('load', () => {
      // Plain GeoJSON source (NO clustering) → every customer is its own coloured dot.
      map.addSource(SRC, { type: 'geojson', data: toMapGeoJSON(points) });

      map.addLayer({
        id: 'points', type: 'circle', source: SRC,
        paint: {
          'circle-color': ['get', 'color'],
          // a touch larger on zoom-in for an easy tap target on mobile
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 8, 16, 11],
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        },
      });

      // Rebuild the sheet from the clicked feature's own properties — reliable at any zoom and
      // independent of the (async-loaded) points prop, which fixes the unreliable tap.
      const openFromEvent = (e: maplibregl.MapLayerMouseEvent) => {
        const p = pointFromProps(e.features?.[0]?.properties as Record<string, unknown> | undefined);
        if (p) setSelected(p);
      };
      map.on('click', 'points', openFromEvent);
      map.on('mouseenter', 'points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'points', () => { map.getCanvas().style.cursor = ''; });
      setReady(true);
    });
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push data updates + fit to the points' bounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(toMapGeoJSON(points));
    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));
    if (valid.length > 0) {
      const b = new maplibregl.LngLatBounds();
      for (const p of valid) b.extend([p.lng, p.lat]);
      map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 0 });
    }
  }, [points, ready]);

  const navigate = (p: FvMapPoint) => openGoogleMapsNavigation(p.lat, p.lng);

  const selDistance = selected && gps ? Math.round(haversineMeters(gps.lat, gps.lng, selected.lat, selected.lng)) : null;

  return (
    <div className="relative">
      {/* legend */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-3 rounded-full border bg-background/95 px-3 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-600" />{t('rpVerify.mapPending')} {counts.pending}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />{t('rpVerify.mapCompleted')} {counts.completed}</span>
      </div>

      <div ref={holder} className="h-[60vh] w-full overflow-hidden rounded-2xl border" />

      {points.length === 0 && (
        <p className="mt-2 rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{t('rpVerify.mapEmpty')}</p>
      )}

      {/* customer bottom sheet */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl border-t bg-background p-4 shadow-2xl max-lg:bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold">{selected.name}</p>
              <p className="text-xs text-muted-foreground">{selected.code ?? ''}</p>
            </div>
            <button onClick={() => setSelected(null)} aria-label={t('common.close')} className="flex h-8 w-8 items-center justify-center rounded-full border"><X className="h-4 w-4" /></button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {selected.city && <span className="text-muted-foreground">{selected.city}</span>}
            {selected.channel && <span className="text-muted-foreground">· {selected.channel}</span>}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            {selected.completed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{t('rpVerify.statusCompleted')}</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700"><Clock className="h-3.5 w-3.5" />{t('rpVerify.statusPending')}</span>
            )}
            {selDistance != null && <span className="inline-flex items-center gap-1 font-semibold text-primary"><Crosshair className="h-3.5 w-3.5" />{t('rpVerify.metersAway', { n: selDistance })}</span>}
            {selected.completed && selected.lastVerifiedAt && (
              <span className="text-muted-foreground">{t('rpVerify.verifiedAt')}: {new Date(selected.lastVerifiedAt).toLocaleString(locale === 'ar' ? 'ar' : 'en')}</span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => { const p = selected; setSelected(null); onOpenCustomer(p); }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold active:scale-[0.99]">
              <Store className="h-4 w-4" />{t('rpVerify.mapOpenCustomer')}
            </button>
            <button onClick={() => navigate(selected)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground active:scale-[0.99]">
              <Navigation className="h-4 w-4" />{t('rpVerify.mapNavigate')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
