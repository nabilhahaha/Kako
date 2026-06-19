'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '@/lib/i18n/provider';

/**
 * VTP planning map — MapLibre points coloured by the active mode; click a point to
 * see its details (popup) and, when a target route is selected, assign it
 * (select-then-assign). Client-only; reuses the keyless OSM raster base.
 */
export interface PlanMapMeta { code?: string | null; route?: string | null; salesman?: string | null; grade?: string | null; coverage?: string | null }
export interface PlanMapPoint { id: string; name: string; lat: number; lng: number; color: string; meta?: PlanMapMeta }

const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

function toGeoJSON(points: PlanMapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id, color: p.color, name: p.name,
        code: p.meta?.code ?? '', route: p.meta?.route ?? '', salesman: p.meta?.salesman ?? '',
        grade: p.meta?.grade ?? '', coverage: p.meta?.coverage ?? '',
      },
    })),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

export function PlanningMap({ points, onSelect }: { points: PlanMapPoint[]; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  // Field labels for the popup, kept current for the load-time click handler.
  const labelsRef = useRef<Record<string, string>>({});
  labelsRef.current = {
    code: t('planBoard.pop_code'), route: t('planBoard.pop_route'), salesman: t('planBoard.pop_salesman'),
    grade: t('planBoard.pop_grade'), coverage: t('planBoard.pop_coverage'),
  };

  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | undefined;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({ container: containerRef.current, style: RASTER_STYLE as never, center: [39.17, 21.58], zoom: 10 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
      map.on('load', () => {
        map!.addSource('pts', { type: 'geojson', data: toGeoJSON(points) });
        map!.addLayer({ id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
        map!.on('click', 'pts', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string>;
          selectRef.current(p.id);
          const L = labelsRef.current;
          const row = (label: string, value: string) => (value ? `<div style="display:flex;gap:6px"><span style="color:#64748b">${esc(label)}</span><span>${esc(value)}</span></div>` : '');
          const html = `<div style="font-size:12px;line-height:1.5"><div style="font-weight:700;margin-bottom:2px">${esc(p.name || '')}</div>${row(L.code, p.code)}${row(L.route, p.route)}${row(L.salesman, p.salesman)}${row(L.grade, (p.grade || '').toUpperCase())}${row(L.coverage, (p.coverage || '').replace(/_/g, ' '))}</div>`;
          new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 10 }).setLngLat(e.lngLat).setHTML(html).addTo(map!);
        });
        map!.on('mouseenter', 'pts', () => { map!.getCanvas().style.cursor = 'pointer'; });
        map!.on('mouseleave', 'pts', () => { map!.getCanvas().style.cursor = ''; });
        fit(map!, points);
      });
    })();
    return () => { cancelled = true; if (map) map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recolour / refilter when points change.
  useEffect(() => {
    const map = mapRef.current as import('maplibre-gl').Map | null;
    const src = map?.getSource?.('pts') as { setData?: (d: unknown) => void } | undefined;
    if (src?.setData) src.setData(toGeoJSON(points));
  }, [points]);

  return <div ref={containerRef} className="h-[60vh] min-h-[360px] w-full overflow-hidden rounded-md border" />;
}

function fit(map: import('maplibre-gl').Map, points: PlanMapPoint[]) {
  if (points.length === 0) return;
  let a = 180, b = 90, c = -180, d = -90;
  for (const p of points) { a = Math.min(a, p.lng); c = Math.max(c, p.lng); b = Math.min(b, p.lat); d = Math.max(d, p.lat); }
  try { map.fitBounds([[a, b], [c, d]], { padding: 40, maxZoom: 13, duration: 300 }); } catch { /* noop */ }
}
