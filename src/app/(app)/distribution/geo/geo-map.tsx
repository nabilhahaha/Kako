'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { COVERAGE_STATUS_KEY } from '@/lib/distribution/coverage-engine';
import type { GeoLayer, GeoLayerId, GeoFeature } from '@/lib/tis/geo';

/**
 * GEO-2 — MapLibre base map (Simple Mode). Renders the provider-agnostic GeoLayer
 * features as coloured points on an OpenStreetMap raster base (no API key), with a
 * one-tap layer switcher + legend and a customer popup that opens Customer 360.
 * The map library loads client-only; the data layer (GEO-1) stays renderer-agnostic.
 */
const LAYER_ORDER: GeoLayerId[] = ['customers', 'coverage', 'ownership', 'whitespace', 'imbalance'];

// Inline style: OSM raster base, no key. Override with NEXT_PUBLIC_MAP_STYLE_URL
// (a vector style URL, e.g. OpenFreeMap/MapTiler) in production for richer tiles.
const RASTER_STYLE = {
  version: 8 as const,
  sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

function toGeoJSON(features: GeoFeature[]) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((f) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [f.lng, f.lat] },
      properties: { id: f.id, name: f.name, color: f.color },
    })),
  };
}

export function GeoMap({ layers, labels }: { layers: Record<GeoLayerId, GeoLayer>; labels: Record<string, string> }) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [active, setActive] = useState<GeoLayerId>('customers');

  const layerLabel = (id: GeoLayerId) => t(`geo.layer_${id}`);
  const legendLabel = (id: GeoLayerId, category: string, raw: string): string => {
    if (id === 'coverage') return t(COVERAGE_STATUS_KEY[category as keyof typeof COVERAGE_STATUS_KEY] ?? 'coverage.statusTitle');
    if (id === 'whitespace') return category === 'whitespace' ? t('geo.whitespace') : t('geo.worked');
    if (id === 'customers') return category === '—' ? t('geo.ungraded') : category.toUpperCase();
    return labels[category] ?? (category ? raw : t('geo.unassigned'));
  };

  // Init the map once (client-only dynamic import).
  useEffect(() => {
    let cancelled = false;
    let map: import('maplibre-gl').Map | undefined;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;
      const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: (styleUrl as unknown as typeof RASTER_STYLE) ?? RASTER_STYLE,
        center: [46.7, 24.7],
        zoom: 9,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
      map.on('load', () => {
        const data = toGeoJSON(layers[active].features);
        map!.addSource('pts', { type: 'geojson', data });
        map!.addLayer({ id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
        map!.on('click', 'pts', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { id: string; name: string };
          new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<div style="font-size:13px"><strong>${escapeHtml(p.name)}</strong><br/><a href="/customers?id=${encodeURIComponent(p.id)}">${escapeHtml(t('geo.openCustomer'))}</a></div>`).addTo(map!);
        });
        map!.on('mouseenter', 'pts', () => { map!.getCanvas().style.cursor = 'pointer'; });
        map!.on('mouseleave', 'pts', () => { map!.getCanvas().style.cursor = ''; });
        fitTo(map!, layers[active].features);
      });
    })();
    return () => { cancelled = true; if (map) map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update points when the active layer changes.
  useEffect(() => {
    const map = mapRef.current as import('maplibre-gl').Map | null;
    if (!map) return;
    const src = map.getSource && (map.getSource('pts') as { setData?: (d: unknown) => void } | undefined);
    if (src?.setData) { src.setData(toGeoJSON(layers[active].features)); fitTo(map, layers[active].features); }
  }, [active, layers]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {LAYER_ORDER.filter((id) => layers[id].available).map((id) => (
          <button key={id} onClick={() => setActive(id)} className={`rounded-md border px-3 py-1.5 text-sm ${active === id ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}>
            {layerLabel(id)}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div ref={containerRef} className="h-[60vh] min-h-[360px] w-full overflow-hidden rounded-md" />
        </CardContent>
      </Card>

      {/* Legend for the active layer. */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {layers[active].legend.map((item) => (
          <span key={item.category || 'none'} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            {legendLabel(active, item.category, item.label)}
          </span>
        ))}
        {layers[active].features.length === 0 && <span className="text-muted-foreground">{t('geo.needsGeo')}</span>}
      </div>
    </div>
  );
}

function fitTo(map: import('maplibre-gl').Map, features: GeoFeature[]) {
  if (features.length === 0) return;
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  for (const f of features) {
    minLng = Math.min(minLng, f.lng); maxLng = Math.max(maxLng, f.lng);
    minLat = Math.min(minLat, f.lat); maxLat = Math.max(maxLat, f.lat);
  }
  try { map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, maxZoom: 14, duration: 400 }); } catch { /* single point / invalid bounds */ }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
