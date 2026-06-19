'use client';

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '@/lib/i18n/provider';

/**
 * Route Planner review/selection map (MapLibre). It is the manager's visual workspace:
 *  • click a point → a details popup (code · name · route + colour · frequency · lat/lng)
 *    with a "Move to {target}" action, and the point toggles in/out of the selection;
 *  • SHIFT-drag a box → add every point inside to the selection;
 *  • focused routes are drawn at full opacity with a convex-hull boundary while the rest
 *    fade, and the view zooms to the focused extent.
 * The parent owns the selection, focus, hulls and point colours; this just renders and
 * reports interactions. Client-only; keyless OSM raster base.
 */
export interface SelMapMeta { code?: string | null; route?: string | null; routeLabel?: string | null; routeColor?: string | null; routeCount?: number; sales?: string | null; frequency?: string | null }
export interface RouteOption { value: string; label: string }
export interface SelMapPoint { id: string; name: string; lat: number; lng: number; color: string; review?: boolean; dim?: boolean; sales?: number; meta?: SelMapMeta }
export interface SelMapHull { id: string; color: string; ring: [number, number][] }

const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

function toPointGeoJSON(points: SelMapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id, color: p.color, review: p.review ? 1 : 0, dim: p.dim ? 1 : 0 },
    })),
  };
}

function toHullGeoJSON(hulls: SelMapHull[]) {
  return {
    type: 'FeatureCollection' as const,
    features: hulls.filter((h) => h.ring.length >= 3).map((h) => ({
      type: 'Feature' as const,
      geometry: { type: 'Polygon' as const, coordinates: [[...h.ring, h.ring[0]]] },
      properties: { color: h.color },
    })),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));

export function SelectionMap({ points, hulls, selectedIds, focusIds, routeOptions, selectMode, tall = false, fill = false, onToggle, onBoxSelect, onMoveSingle, onContextMenu, onSelecting, onSelectComplete }: {
  points: SelMapPoint[];
  hulls: SelMapHull[];
  selectedIds: Set<string>;
  focusIds: Set<string>;
  routeOptions: RouteOption[];
  /** Interaction mode: pan the map, drag a selection box, or lasso-draw a selection. */
  selectMode: 'pan' | 'box' | 'draw';
  tall?: boolean;
  /** Fill the parent's height (for the focus flex layout) instead of a fixed vh. */
  fill?: boolean;
  onToggle: (id: string) => void;
  onBoxSelect: (ids: string[]) => void;
  onMoveSingle: (id: string, dest: string) => void;
  onContextMenu: (x: number, y: number) => void;
  onSelecting: (info: { count: number; sales: number } | null) => void;
  /** Fired after a Box or Draw selection gesture finishes — the parent returns to Pan mode. */
  onSelectComplete?: () => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const glRef = useRef<typeof import('maplibre-gl') | null>(null);
  const pointsRef = useRef(points); pointsRef.current = points;
  const metaRef = useRef(new Map<string, SelMapPoint>()); metaRef.current = new Map(points.map((p) => [p.id, p]));
  const toggleRef = useRef(onToggle); toggleRef.current = onToggle;
  const boxRef = useRef(onBoxSelect); boxRef.current = onBoxSelect;
  const moveRef = useRef(onMoveSingle); moveRef.current = onMoveSingle;
  const ctxRef = useRef(onContextMenu); ctxRef.current = onContextMenu;
  const selectingRef = useRef(onSelecting); selectingRef.current = onSelecting;
  const optionsRef = useRef(routeOptions); optionsRef.current = routeOptions;
  const modeRef = useRef(selectMode); modeRef.current = selectMode;
  const selectDoneRef = useRef(onSelectComplete); selectDoneRef.current = onSelectComplete;
  const labelsRef = useRef({ code: '', route: '', freq: '', geo: '', move: '', current: '', moveTo: '', routeCount: '', sales: '' });
  labelsRef.current = { code: t('planBoard.pop_code'), route: t('planBoard.pop_route'), freq: t('routePlanner.colFrequency'), geo: t('routePlanner.colGeo2'), move: t('routePlanner.move'), current: t('routePlanner.currentRoute'), moveTo: t('routePlanner.moveTo'), routeCount: t('routePlanner.routeCustomers'), sales: t('routePlanner.colSales') };
  const fitOnce = useRef(false);
  const focusKey = [...focusIds].sort().join(',');

  // ── init once ──
  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | undefined;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;
      glRef.current = maplibregl as unknown as typeof import('maplibre-gl');
      map = new maplibregl.Map({ container: containerRef.current, style: RASTER_STYLE as never, center: [39.17, 21.58], zoom: 9 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;

      map.on('load', () => {
        // Route boundaries (under the points).
        map!.addSource('hulls', { type: 'geojson', data: toHullGeoJSON(hulls) });
        map!.addLayer({ id: 'hull-fill', type: 'fill', source: 'hulls', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 } });
        map!.addLayer({ id: 'hull-line', type: 'line', source: 'hulls', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.9 } });

        map!.addSource('pts', { type: 'geojson', data: toPointGeoJSON(pointsRef.current) });
        const dimOpacity = ['case', ['==', ['get', 'dim'], 1], 0.18, 0.9] as never;
        map!.addLayer({ id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-opacity': dimOpacity, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
        map!.addLayer({ id: 'review', type: 'circle', source: 'pts', filter: ['==', ['get', 'review'], 1], paint: { 'circle-radius': 6, 'circle-color': '#f59e0b', 'circle-opacity': dimOpacity, 'circle-stroke-width': 2, 'circle-stroke-color': '#7c2d12' } });
        map!.addLayer({ id: 'sel', type: 'circle', source: 'pts', filter: ['in', ['get', 'id'], ['literal', []]], paint: { 'circle-radius': 8, 'circle-color': '#000000', 'circle-opacity': 0, 'circle-stroke-width': 3, 'circle-stroke-color': '#0f172a' } });

        map!.on('click', 'pts', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const id = (f.properties as { id: string }).id;
          toggleRef.current(id);
          showPopup(map!, e.lngLat, id);
        });
        map!.on('mouseenter', 'pts', () => { map!.getCanvas().style.cursor = 'pointer'; });
        map!.on('mouseleave', 'pts', () => { map!.getCanvas().style.cursor = ''; });

        // Area select: BOX mode = Shift-drag a rectangle; DRAW mode = freehand polygon.
        const canvas = map!.getCanvasContainer();
        const mousePos = (ev: MouseEvent) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
        let startPt: { x: number; y: number } | null = null;
        let boxEl: HTMLDivElement | null = null;
        let drawing = false;
        let path: { x: number; y: number }[] = [];
        let svg: SVGSVGElement | null = null;
        let poly: SVGPolygonElement | null = null;

        const clearOverlay = () => { if (boxEl) { boxEl.remove(); boxEl = null; } if (svg) { svg.remove(); svg = null; poly = null; } };
        // Live count + sales while drawing/boxing (throttled so a big polygon never slows the map).
        let lastCount = 0;
        const liveCount = (pred: (p: SelMapPoint) => boolean) => {
          const now = Date.now();
          if (now - lastCount < 70) return;
          lastCount = now;
          let count = 0, sales = 0;
          for (const p of pointsRef.current) if (pred(p)) { count++; sales += p.sales ?? 0; }
          selectingRef.current({ count, sales });
        };

        const onMove = (ev: MouseEvent) => {
          const cur = mousePos(ev);
          if (drawing) {
            path.push(cur);
            if (!svg) {
              svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
              svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:10');
              poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
              poly.setAttribute('fill', 'rgba(37,99,235,0.12)'); poly.setAttribute('stroke', '#2563eb'); poly.setAttribute('stroke-width', '1.5');
              svg.appendChild(poly); canvas.appendChild(svg);
            }
            poly!.setAttribute('points', path.map((p) => `${p.x},${p.y}`).join(' '));
            if (path.length >= 3) liveCount((p) => pointInPoly(map!.project([p.lng, p.lat]), path));
            return;
          }
          if (!startPt) return;
          if (!boxEl) { boxEl = document.createElement('div'); boxEl.style.cssText = 'position:absolute;background:rgba(37,99,235,0.12);border:1.5px solid #2563eb;pointer-events:none;z-index:10'; canvas.appendChild(boxEl); }
          const sx = startPt;
          boxEl.style.left = `${Math.min(sx.x, cur.x)}px`; boxEl.style.top = `${Math.min(sx.y, cur.y)}px`;
          boxEl.style.width = `${Math.abs(cur.x - sx.x)}px`; boxEl.style.height = `${Math.abs(cur.y - sx.y)}px`;
          const x1 = Math.min(sx.x, cur.x), x2 = Math.max(sx.x, cur.x), y1 = Math.min(sx.y, cur.y), y2 = Math.max(sx.y, cur.y);
          liveCount((p) => { const px = map!.project([p.lng, p.lat]); return px.x >= x1 && px.x <= x2 && px.y >= y1 && px.y <= y2; });
        };
        const onUp = (ev: MouseEvent) => {
          document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
          map!.dragPan.enable();
          selectingRef.current(null);
          const cur = mousePos(ev);
          if (drawing) {
            drawing = false; clearOverlay();
            const ring = path; path = [];
            if (ring.length >= 3) {
              const hits = pointsRef.current.filter((p) => pointInPoly(map!.project([p.lng, p.lat]), ring)).map((p) => p.id);
              if (hits.length) boxRef.current(hits);
            }
            // A finished lasso returns to Pan mode (intuitive for reviewing big territories).
            selectDoneRef.current?.();
            return;
          }
          clearOverlay();
          if (!startPt) return;
          const x1 = Math.min(startPt.x, cur.x), x2 = Math.max(startPt.x, cur.x), y1 = Math.min(startPt.y, cur.y), y2 = Math.max(startPt.y, cur.y);
          startPt = null;
          if (x2 - x1 < 3 && y2 - y1 < 3) return; // a tiny box is a click, not a selection
          const hits: string[] = [];
          for (const p of pointsRef.current) { const px = map!.project([p.lng, p.lat]); if (px.x >= x1 && px.x <= x2 && px.y >= y1 && px.y <= y2) hits.push(p.id); }
          if (hits.length) boxRef.current(hits);
          // A finished box returns to Pan mode too — select, then keep reviewing the map.
          selectDoneRef.current?.();
        };
        const onDown = (ev: MouseEvent) => {
          if (ev.button !== 0) return;
          const mode = modeRef.current;
          // Draw mode: left-drag draws a freehand lasso (Shift falls through to a box).
          if (mode === 'draw' && !ev.shiftKey) {
            ev.preventDefault(); map!.dragPan.disable(); drawing = true; path = [mousePos(ev)];
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            return;
          }
          // Box mode: left-drag draws a rectangle directly (no Shift needed). Shift in any
          // mode is also a box shortcut, so a Pan-mode power user can still Shift-box.
          if (mode === 'box' || ev.shiftKey) {
            ev.preventDefault(); map!.dragPan.disable(); startPt = mousePos(ev);
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            return;
          }
          // Pan mode: do nothing — MapLibre handles the drag-pan.
        };
        canvas.addEventListener('mousedown', onDown, true);
        // Right-click → context menu (acts on the current selection in the parent).
        const onCtx = (ev: MouseEvent) => { ev.preventDefault(); ctxRef.current(ev.clientX, ev.clientY); };
        canvas.addEventListener('contextmenu', onCtx);
        (map as unknown as { _rpCleanup?: () => void })._rpCleanup = () => { canvas.removeEventListener('mousedown', onDown, true); canvas.removeEventListener('contextmenu', onCtx); };

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

  function showPopup(map: import('maplibre-gl').Map, lngLat: import('maplibre-gl').LngLatLike, id: string) {
    const gl = glRef.current;
    const p = metaRef.current.get(id);
    if (!gl || !p) return;
    const L = labelsRef.current;
    const m = p.meta ?? {};
    const swatch = m.routeColor ? `<span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:${esc(m.routeColor)};margin-inline-end:4px;vertical-align:middle"></span>` : '';
    const row = (label: string, value: string) => (value ? `<div style="display:flex;gap:6px"><span style="color:#64748b">${esc(label)}</span><span>${value}</span></div>` : '');
    // Destination dropdown: existing routes first, "New route" last. Default to the
    // customer's CURRENT route (so a stray click doesn't move it), else the first route.
    const current = m.route || '';
    const opts = optionsRef.current.map((o) => `<option value="${esc(o.value)}"${o.value === current ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
    const html = `<div style="font-size:12px;line-height:1.6;min-width:170px">
      <div style="font-weight:700;margin-bottom:2px">${esc(p.name || '')}</div>
      ${row(L.code, esc(m.code || ''))}
      ${row(L.current, swatch + esc(m.routeLabel || '—'))}
      ${m.routeCount != null ? row(L.routeCount, String(m.routeCount)) : ''}
      ${m.sales ? row(L.sales, esc(m.sales)) : ''}
      ${row(L.freq, esc(m.frequency || '—'))}
      ${row(L.geo, `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)}
      <div style="margin-top:6px;color:#64748b">${esc(L.moveTo)}</div>
      <div style="display:flex;gap:4px;margin-top:2px">
        <select id="rp-move-sel" style="flex:1;height:28px;border:1px solid #cbd5e1;border-radius:6px;padding:0 4px;font-size:12px;background:#fff">${opts}</select>
        <button id="rp-move-btn" style="padding:0 10px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-size:12px">${esc(L.move)}</button>
      </div>
    </div>`;
    const popup = new gl.Popup({ closeButton: true, closeOnClick: true, offset: 10 }).setLngLat(lngLat).setHTML(html).addTo(map);
    const el = popup.getElement();
    el?.querySelector('#rp-move-btn')?.addEventListener('click', () => {
      const sel = el.querySelector('#rp-move-sel') as HTMLSelectElement | null;
      if (sel) moveRef.current(id, sel.value);
      popup.remove();
    });
  }

  // Recolour / refilter when points change.
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource?.('pts') as { setData?: (d: unknown) => void } | undefined;
    if (src?.setData) {
      src.setData(toPointGeoJSON(points));
      if (!fitOnce.current && points.length) { fit(map!, points); fitOnce.current = true; }
    }
  }, [points]);

  // Update route boundaries.
  useEffect(() => {
    const src = mapRef.current?.getSource?.('hulls') as { setData?: (d: unknown) => void } | undefined;
    if (src?.setData) src.setData(toHullGeoJSON(hulls));
  }, [hulls]);

  // Update the selection ring.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer?.('sel')) map.setFilter('sel', ['in', ['get', 'id'], ['literal', [...selectedIds]]] as never);
  }, [selectedIds]);

  // Zoom to the focused routes' extent when the focus changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || focusIds.size === 0) return;
    const pts = pointsRef.current.filter((p) => focusIds.has(p.id));
    if (pts.length) fit(map, pts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return <div ref={containerRef} className={`w-full overflow-hidden rounded-xl border ${fill ? 'h-full min-h-[320px]' : tall ? 'h-[82vh] min-h-[520px]' : 'h-[62vh] min-h-[380px]'}`} />;
}

/** Ray-casting point-in-polygon on screen pixels (for freehand draw select). */
function pointInPoly(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function fit(map: import('maplibre-gl').Map, points: { lat: number; lng: number }[]) {
  if (points.length === 0) return;
  let a = 180, b = 90, c = -180, d = -90;
  for (const p of points) { a = Math.min(a, p.lng); c = Math.max(c, p.lng); b = Math.min(b, p.lat); d = Math.max(d, p.lat); }
  try { map.fitBounds([[a, b], [c, d]], { padding: 50, maxZoom: 13, duration: 400 }); } catch { /* noop */ }
}
