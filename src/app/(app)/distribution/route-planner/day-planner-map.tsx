'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface DayMapPoint { id: string; name: string; lat: number; lng: number; seq?: number }
export interface DayMapEndpoint { lat: number; lng: number; kind: 'start' | 'end' }
export type DaySelectMode = 'none' | 'box' | 'area';

const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

/** Ray-casting point-in-polygon in screen (pixel) space. */
function inScreenPoly(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Day Planner map — selected customers, an ordered path line (Start → 1 → 2 → … → End)
 * and numbered HTML markers, plus a green Start and red End marker. Two simple selection
 * modes: Rectangle (drag a box) and Draw Area (freehand — draw a shape and release; the
 * customers inside are selected). Forced LTR so markers don't drift under the panel in the
 * Arabic (RTL) layout. Client-only.
 */
export function DayPlannerMap({ points, path, endpoints, selectedIds, onToggle, onMapClick, picking, selectMode = 'none', onBoxSelect }: {
  points: DayMapPoint[];
  path: [number, number][]; // ordered [lng,lat] incl. start & end
  endpoints: DayMapEndpoint[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  picking: boolean; // when true, a map click sets a point instead of panning-only
  selectMode?: DaySelectMode;
  onBoxSelect?: (ids: string[], additive: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const polyRef = useRef<SVGPolylineElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const glRef = useRef<typeof import('maplibre-gl') | null>(null);
  const markersRef = useRef<import('maplibre-gl').Marker[]>([]);
  const fitOnce = useRef(false);
  const cb = useRef({ onToggle, onMapClick, picking, selectMode, onBoxSelect });
  cb.current = { onToggle, onMapClick, picking, selectMode, onBoxSelect };
  const dataRef = useRef({ points, path, endpoints, selectedIds });
  dataRef.current = { points, path, endpoints, selectedIds };

  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | undefined;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;
      glRef.current = maplibregl as unknown as typeof import('maplibre-gl');
      map = new maplibregl.Map({ container: containerRef.current, style: RASTER_STYLE as never, center: [39.17, 21.58], zoom: 9 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
      mapRef.current = map;
      map.on('load', () => { sync(); });
      map.on('click', (e) => { if (cb.current.picking) cb.current.onMapClick(e.lngLat.lat, e.lngLat.lng); });

      const canvas = map.getCanvasContainer();
      let mode: DaySelectMode = 'none';
      let additive = false;
      let start: { x: number; y: number } | null = null;     // box anchor
      let free: { x: number; y: number }[] = [];             // freehand path
      const rel = (ev: MouseEvent) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

      const selectInside = (test: (x: number, y: number) => boolean) => {
        const m = mapRef.current; if (!m) return;
        const ids: string[] = [];
        for (const p of dataRef.current.points) { const pt = m.project([p.lng, p.lat]); if (test(pt.x, pt.y)) ids.push(p.id); }
        cb.current.onBoxSelect?.(ids, additive);
      };

      const onMove = (ev: MouseEvent) => {
        const { x, y } = rel(ev);
        if (mode === 'box' && start && boxRef.current) {
          const left = Math.min(start.x, x), top = Math.min(start.y, y);
          Object.assign(boxRef.current.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${Math.abs(x - start.x)}px`, height: `${Math.abs(y - start.y)}px` });
        } else if (mode === 'area' && polyRef.current) {
          free.push({ x, y });
          polyRef.current.setAttribute('points', free.map((p) => `${p.x},${p.y}`).join(' '));
        }
      };
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const { x, y } = rel(ev);
        if (mode === 'box' && start) {
          if (boxRef.current) boxRef.current.style.display = 'none';
          const minX = Math.min(start.x, x), maxX = Math.max(start.x, x), minY = Math.min(start.y, y), maxY = Math.max(start.y, y);
          if (maxX - minX >= 4 || maxY - minY >= 4) selectInside((px, py) => px >= minX && px <= maxX && py >= minY && py <= maxY);
        } else if (mode === 'area') {
          const poly = [...free];
          if (polyRef.current) polyRef.current.setAttribute('points', '');
          if (poly.length >= 3) selectInside((px, py) => inScreenPoly(px, py, poly));
        }
        start = null; free = []; mode = 'none';
      };
      const onDown = (ev: MouseEvent) => {
        if (ev.button !== 0 || (cb.current.selectMode !== 'box' && cb.current.selectMode !== 'area')) return;
        ev.preventDefault(); ev.stopPropagation();
        mode = cb.current.selectMode;
        additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;
        const { x, y } = rel(ev);
        if (mode === 'box') start = { x, y };
        else free = [{ x, y }];
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
      canvas.addEventListener('mousedown', onDown);
      (map as unknown as { __cleanup?: () => void }).__cleanup = () => {
        canvas.removeEventListener('mousedown', onDown);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      if (map) { (map as unknown as { __cleanup?: () => void }).__cleanup?.(); map.remove(); }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Disable map panning while selecting so a drag draws the box/area, not a pan.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (selectMode === 'box' || selectMode === 'area') m.dragPan.disable(); else m.dragPan.enable();
  }, [selectMode]);

  useEffect(() => { sync(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [points, path, endpoints, selectedIds]);

  function sync() {
    const map = mapRef.current, gl = glRef.current;
    if (!map || !gl || !map.isStyleLoaded()) return;
    const { points: pts, path: line, endpoints: eps, selectedIds: sel } = dataRef.current;

    const lineData = { type: 'FeatureCollection' as const, features: line.length >= 2 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: line }, properties: {} }] : [] };
    const src = map.getSource('day-path') as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(lineData);
    else {
      map.addSource('day-path', { type: 'geojson', data: lineData });
      map.addLayer({ id: 'day-path-line', type: 'line', source: 'day-path', paint: { 'line-color': '#2563eb', 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [2, 1] } });
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const p of pts) {
      const el = document.createElement('div');
      const on = sel.has(p.id);
      if (p.seq != null) {
        el.textContent = String(p.seq);
        el.style.cssText = `display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#2563eb;color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer`;
      } else if (on) {
        // Strong highlight for a selected customer.
        el.style.cssText = `width:16px;height:16px;border-radius:9999px;background:#16a34a;border:3px solid #fff;box-shadow:0 0 0 2px #16a34a,0 1px 3px rgba(0,0,0,.5);cursor:pointer`;
      } else {
        el.style.cssText = `width:11px;height:11px;border-radius:9999px;background:#94a3b8;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.4);cursor:pointer`;
      }
      el.title = p.name;
      el.addEventListener('click', (ev) => { ev.stopPropagation(); cb.current.onToggle(p.id); });
      markersRef.current.push(new gl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
    }
    for (const ep of eps) {
      const el = document.createElement('div');
      el.textContent = ep.kind === 'start' ? 'S' : 'E';
      el.style.cssText = `display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:${ep.kind === 'start' ? '#16a34a' : '#dc2626'};color:#fff;font-size:12px;font-weight:800;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)`;
      markersRef.current.push(new gl.Marker({ element: el }).setLngLat([ep.lng, ep.lat]).addTo(map));
    }

    if (!fitOnce.current) {
      const all = [...pts.map((p) => [p.lng, p.lat] as [number, number]), ...eps.map((e) => [e.lng, e.lat] as [number, number])];
      if (all.length) {
        const b = new gl.LngLatBounds(all[0], all[0]);
        for (const c of all) b.extend(c);
        map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 0 });
        fitOnce.current = true;
      }
    }
  }

  // Forced LTR: MapLibre positions DOM markers with absolute offsets that get mirrored
  // inside an RTL (Arabic) document, making markers drift under the side panel.
  return (
    <div dir="ltr" className="relative h-full w-full overflow-hidden" style={{ minHeight: 320 }}>
      <div ref={containerRef} className={`h-full w-full overflow-hidden rounded-xl border ${picking || selectMode !== 'none' ? 'cursor-crosshair' : ''}`} style={{ minHeight: 320 }} />
      {/* Box selection rectangle (positioned in JS). */}
      <div ref={boxRef} className="pointer-events-none absolute z-10 hidden rounded border-2 border-primary bg-primary/15" style={{ display: 'none' }} />
      {/* Freehand area path. */}
      <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full"><polyline ref={polyRef} points="" fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth={2} /></svg>
    </div>
  );
}
