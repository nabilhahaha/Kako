'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * VTP-3 planning map — MapLibre points coloured by scenario route; click a point
 * to assign it to the currently-selected target route (select-then-assign;
 * dragging points across map space is fiddly, so this is the robust map edit).
 * Client-only; reuses the keyless OSM raster base.
 */
export interface PlanMapPoint { id: string; name: string; lat: number; lng: number; color: string }

const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

function toGeoJSON(points: PlanMapPoint[]) {
  return { type: 'FeatureCollection' as const, features: points.map((p) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] }, properties: { id: p.id, color: p.color } })) };
}

export function PlanningMap({ points, onSelect }: { points: PlanMapPoint[]; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

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
        map!.on('click', 'pts', (e) => { const f = e.features?.[0]; if (f) selectRef.current((f.properties as { id: string }).id); });
        map!.on('mouseenter', 'pts', () => { map!.getCanvas().style.cursor = 'pointer'; });
        map!.on('mouseleave', 'pts', () => { map!.getCanvas().style.cursor = ''; });
        fit(map!, points);
      });
    })();
    return () => { cancelled = true; if (map) map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recolour when assignments change.
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
