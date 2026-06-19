'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Route Planner selection map — MapLibre points the manager corrects by hand:
 *  • click a point to toggle it in/out of the selection;
 *  • SHIFT-drag a box to add every point inside it to the selection.
 * Selected points get a dark ring. The parent owns the selection set and the
 * point colours (by route), so a "Move to route" recolours instantly via setData.
 * Client-only; reuses the keyless OSM raster base (same as the planning board).
 */
export interface SelMapPoint { id: string; name: string; lat: number; lng: number; color: string }

const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

function toGeoJSON(points: SelMapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id, color: p.color, name: p.name },
    })),
  };
}

export function SelectionMap({ points, selectedIds, onToggle, onBoxSelect }: {
  points: SelMapPoint[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onBoxSelect: (ids: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  // Keep handlers/data current for the once-only map init closures.
  const pointsRef = useRef(points); pointsRef.current = points;
  const toggleRef = useRef(onToggle); toggleRef.current = onToggle;
  const boxRef = useRef(onBoxSelect); boxRef.current = onBoxSelect;
  const fitOnce = useRef(false);

  // ── init once ──
  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | undefined;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({ container: containerRef.current, style: RASTER_STYLE as never, center: [39.17, 21.58], zoom: 9 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;

      map.on('load', () => {
        map!.addSource('pts', { type: 'geojson', data: toGeoJSON(pointsRef.current) });
        map!.addLayer({ id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
        // Selection ring (filtered to selected ids; updated separately).
        map!.addLayer({ id: 'sel', type: 'circle', source: 'pts', filter: ['in', ['get', 'id'], ['literal', []]], paint: { 'circle-radius': 8, 'circle-color': '#000000', 'circle-opacity': 0, 'circle-stroke-width': 3, 'circle-stroke-color': '#0f172a' } });

        map!.on('click', 'pts', (e) => {
          const f = e.features?.[0];
          if (f) toggleRef.current((f.properties as { id: string }).id);
        });
        map!.on('mouseenter', 'pts', () => { map!.getCanvas().style.cursor = 'pointer'; });
        map!.on('mouseleave', 'pts', () => { map!.getCanvas().style.cursor = ''; });

        // ── SHIFT-drag box select ──
        const canvas = map!.getCanvasContainer();
        const mousePos = (ev: MouseEvent) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
        let startPt: { x: number; y: number } | null = null;
        let boxEl: HTMLDivElement | null = null;

        const onMove = (ev: MouseEvent) => {
          if (!startPt) return;
          const cur = mousePos(ev);
          if (!boxEl) {
            boxEl = document.createElement('div');
            boxEl.style.cssText = 'position:absolute;background:rgba(37,99,235,0.12);border:1.5px solid #2563eb;pointer-events:none;z-index:10';
            canvas.appendChild(boxEl);
          }
          const minX = Math.min(startPt.x, cur.x), minY = Math.min(startPt.y, cur.y);
          boxEl.style.left = `${minX}px`; boxEl.style.top = `${minY}px`;
          boxEl.style.width = `${Math.abs(cur.x - startPt.x)}px`; boxEl.style.height = `${Math.abs(cur.y - startPt.y)}px`;
        };
        const onUp = (ev: MouseEvent) => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          map!.dragPan.enable();
          if (boxEl) { boxEl.remove(); boxEl = null; }
          if (!startPt) return;
          const cur = mousePos(ev);
          const x1 = Math.min(startPt.x, cur.x), x2 = Math.max(startPt.x, cur.x);
          const y1 = Math.min(startPt.y, cur.y), y2 = Math.max(startPt.y, cur.y);
          startPt = null;
          if (x2 - x1 < 3 && y2 - y1 < 3) return; // a click, not a box
          const hits: string[] = [];
          for (const p of pointsRef.current) {
            const px = map!.project([p.lng, p.lat]);
            if (px.x >= x1 && px.x <= x2 && px.y >= y1 && px.y <= y2) hits.push(p.id);
          }
          if (hits.length) boxRef.current(hits);
        };
        const onDown = (ev: MouseEvent) => {
          if (!ev.shiftKey || ev.button !== 0) return;
          ev.preventDefault();
          map!.dragPan.disable();
          startPt = mousePos(ev);
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        };
        canvas.addEventListener('mousedown', onDown, true);
        (map as unknown as { _rpCleanup?: () => void })._rpCleanup = () => canvas.removeEventListener('mousedown', onDown, true);

        if (!fitOnce.current) { fit(map!, pointsRef.current); fitOnce.current = true; }
      });
    })();
    return () => {
      cancelled = true;
      const m = map as unknown as { _rpCleanup?: () => void } | undefined;
      m?._rpCleanup?.();
      if (map) map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recolour when points change (after Generate / Move).
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource?.('pts') as { setData?: (d: unknown) => void } | undefined;
    if (src?.setData) {
      src.setData(toGeoJSON(points));
      if (!fitOnce.current && points.length) { fit(map!, points); fitOnce.current = true; }
    }
  }, [points]);

  // Update the selection ring filter when the selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer?.('sel')) {
      map.setFilter('sel', ['in', ['get', 'id'], ['literal', [...selectedIds]]] as never);
    }
  }, [selectedIds]);

  return <div ref={containerRef} className="h-[62vh] min-h-[380px] w-full overflow-hidden rounded-md border" />;
}

function fit(map: import('maplibre-gl').Map, points: SelMapPoint[]) {
  if (points.length === 0) return;
  let a = 180, b = 90, c = -180, d = -90;
  for (const p of points) { a = Math.min(a, p.lng); c = Math.max(c, p.lng); b = Math.min(b, p.lat); d = Math.max(d, p.lat); }
  try { map.fitBounds([[a, b], [c, d]], { padding: 40, maxZoom: 13, duration: 300 }); } catch { /* noop */ }
}
