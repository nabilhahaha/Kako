'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface DayMapPoint { id: string; name: string; lat: number; lng: number; seq?: number }
export interface DayMapEndpoint { lat: number; lng: number; kind: 'start' | 'end' }

const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

/**
 * Day Planner map — shows the selected customers, an ordered path line (Start → 1 → 2 → …
 * → End) and numbered HTML markers, plus a green Start and red End marker. Numbers are DOM
 * markers (the keyless raster base has no glyphs, so MapLibre text symbols can't render).
 * Click a pin to toggle selection. Client-only.
 */
export type DaySelectMode = 'none' | 'box' | 'polygon';

export function DayPlannerMap({ points, path, endpoints, selectedIds, onToggle, onMapClick, picking, selectMode = 'none', polygon = [], onBoxSelect, onPolyVertex }: {
  points: DayMapPoint[];
  path: [number, number][]; // ordered [lng,lat] incl. start & end
  endpoints: DayMapEndpoint[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  picking: boolean; // when true, a map click sets a point instead of panning-only
  selectMode?: DaySelectMode; // 'box' = drag a rectangle; 'polygon' = click vertices
  polygon?: [number, number][]; // in-progress polygon ring [lng,lat] (rendered)
  onBoxSelect?: (ids: string[], additive: boolean) => void;
  onPolyVertex?: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const glRef = useRef<typeof import('maplibre-gl') | null>(null);
  const markersRef = useRef<import('maplibre-gl').Marker[]>([]);
  const fitOnce = useRef(false);
  const cb = useRef({ onToggle, onMapClick, picking, selectMode, onBoxSelect, onPolyVertex });
  cb.current = { onToggle, onMapClick, picking, selectMode, onBoxSelect, onPolyVertex };
  const dataRef = useRef({ points, path, endpoints, selectedIds, polygon });
  dataRef.current = { points, path, endpoints, selectedIds, polygon };

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
      map.on('click', (e) => {
        if (cb.current.picking) cb.current.onMapClick(e.lngLat.lat, e.lngLat.lng);
        else if (cb.current.selectMode === 'polygon') cb.current.onPolyVertex?.(e.lngLat.lat, e.lngLat.lng);
      });

      // ── Box / area draw-select: drag a rectangle to select the points inside. ──
      let startPt: { x: number; y: number } | null = null;
      let additive = false;
      const canvas = map.getCanvasContainer();
      const onMove = (ev: MouseEvent) => {
        if (!startPt || !boxRef.current) return;
        const r = canvas.getBoundingClientRect();
        const x = ev.clientX - r.left, y = ev.clientY - r.top;
        const left = Math.min(startPt.x, x), top = Math.min(startPt.y, y);
        Object.assign(boxRef.current.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${Math.abs(x - startPt.x)}px`, height: `${Math.abs(y - startPt.y)}px` });
      };
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (boxRef.current) boxRef.current.style.display = 'none';
        const m = mapRef.current;
        if (!startPt || !m) { startPt = null; return; }
        const r = canvas.getBoundingClientRect();
        const x = ev.clientX - r.left, y = ev.clientY - r.top;
        const minX = Math.min(startPt.x, x), maxX = Math.max(startPt.x, x);
        const minY = Math.min(startPt.y, y), maxY = Math.max(startPt.y, y);
        startPt = null;
        if (maxX - minX < 4 && maxY - minY < 4) return; // a click, not a drag
        const ids: string[] = [];
        for (const p of dataRef.current.points) {
          const pt = m.project([p.lng, p.lat]);
          if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) ids.push(p.id);
        }
        cb.current.onBoxSelect?.(ids, additive);
      };
      const onDown = (ev: MouseEvent) => {
        if (cb.current.selectMode !== 'box' || ev.button !== 0) return;
        ev.preventDefault(); ev.stopPropagation();
        additive = ev.shiftKey || ev.ctrlKey || ev.metaKey;
        const r = canvas.getBoundingClientRect();
        startPt = { x: ev.clientX - r.left, y: ev.clientY - r.top };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      };
      canvas.addEventListener('mousedown', onDown);
      (map as unknown as { __cleanupDraw?: () => void }).__cleanupDraw = () => {
        canvas.removeEventListener('mousedown', onDown);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      if (map) { (map as unknown as { __cleanupDraw?: () => void }).__cleanupDraw?.(); map.remove(); }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Disable map panning while box-drawing so a drag draws a rectangle, not a pan.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (selectMode === 'box') m.dragPan.disable(); else m.dragPan.enable();
  }, [selectMode]);

  // Re-sync the path line + markers + polygon whenever data changes.
  useEffect(() => { sync(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [points, path, endpoints, selectedIds, polygon]);

  function sync() {
    const map = mapRef.current, gl = glRef.current;
    if (!map || !gl || !map.isStyleLoaded()) return;
    const { points: pts, path: line, endpoints: eps, selectedIds: sel, polygon: poly } = dataRef.current;

    // In-progress polygon (closed for display).
    const ring = poly.length >= 2 ? [...poly, poly[0]] : [];
    const polyData = { type: 'FeatureCollection' as const, features: ring.length >= 2 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: ring }, properties: {} }] : [] };
    const polySrc = map.getSource('day-poly') as import('maplibre-gl').GeoJSONSource | undefined;
    if (polySrc) polySrc.setData(polyData);
    else {
      map.addSource('day-poly', { type: 'geojson', data: polyData });
      map.addLayer({ id: 'day-poly-line', type: 'line', source: 'day-poly', paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [1.5, 1] } });
    }

    // Path line.
    const lineData = { type: 'FeatureCollection' as const, features: line.length >= 2 ? [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: line }, properties: {} }] : [] };
    const src = map.getSource('day-path') as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) src.setData(lineData);
    else {
      map.addSource('day-path', { type: 'geojson', data: lineData });
      map.addLayer({ id: 'day-path-line', type: 'line', source: 'day-path', paint: { 'line-color': '#2563eb', 'line-width': 2.5, 'line-opacity': 0.7, 'line-dasharray': [2, 1] } });
    }

    // Rebuild HTML markers (small list — one salesman's day).
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    for (const p of pts) {
      const el = document.createElement('div');
      const on = sel.has(p.id);
      if (p.seq != null) {
        el.textContent = String(p.seq);
        el.style.cssText = `display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:${on ? '#0f172a' : '#2563eb'};color:#fff;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);cursor:pointer`;
      } else {
        el.style.cssText = `width:11px;height:11px;border-radius:9999px;background:${on ? '#0f172a' : '#94a3b8'};border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.4);cursor:pointer`;
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
    // Polygon vertex dots (purple) while drawing a free-form area.
    for (const v of poly) {
      const el = document.createElement('div');
      el.style.cssText = 'width:9px;height:9px;border-radius:9999px;background:#7c3aed;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.4)';
      markersRef.current.push(new gl.Marker({ element: el }).setLngLat([v[0], v[1]]).addTo(map));
    }

    // Fit once to the data.
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

  return (
    <div className="relative h-full w-full" style={{ minHeight: 320 }}>
      <div ref={containerRef} className={`h-full w-full overflow-hidden rounded-xl border ${picking || selectMode !== 'none' ? 'cursor-crosshair' : ''}`} style={{ minHeight: 320 }} />
      {/* Drag-select rectangle overlay (positioned in JS; hidden by default). */}
      <div ref={boxRef} className="pointer-events-none absolute z-10 hidden rounded border-2 border-primary bg-primary/15" style={{ display: 'none' }} />
    </div>
  );
}
