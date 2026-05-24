import { useMemo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, CircleMarker, Polyline, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Eye, EyeOff } from 'lucide-react';
import type { RouteResult, Depot } from '../types';

import 'leaflet/dist/leaflet.css';

const depotIcon = L.divIcon({
  html: '<div style="background:#ef4444;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  className: '',
});

interface RouteMapProps {
  routes: RouteResult[];
  outstationRoutes: RouteResult[];
  onMapClick?: (routeIndex: number, lat: number, lng: number) => void;
  depotEditRoute: number | null;
}

function MapClickHandler({ onMapClick, routeIndex }: { onMapClick: (ri: number, lat: number, lng: number) => void; routeIndex: number }) {
  useMapEvents({
    click(e) {
      onMapClick(routeIndex, e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function RouteMap({ routes, outstationRoutes, onMapClick, depotEditRoute }: RouteMapProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState<Set<number>>(() => new Set(routes.map((_, i) => i)));
  const [outstationVisible, setOutstationVisible] = useState<Set<number>>(
    () => new Set(outstationRoutes.map((_, i) => i)),
  );

  const allRoutes = useMemo(() => [...routes, ...outstationRoutes], [routes, outstationRoutes]);

  const center = useMemo(() => {
    const allCustomers = allRoutes.flatMap((r) => r.customers);
    if (allCustomers.length === 0) return { lat: 24.7136, lng: 46.6753 };
    const avgLat = allCustomers.reduce((s, c) => s + c.lat, 0) / allCustomers.length;
    const avgLng = allCustomers.reduce((s, c) => s + c.lng, 0) / allCustomers.length;
    return { lat: avgLat, lng: avgLng };
  }, [allRoutes]);

  const toggleRoute = useCallback((idx: number) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleOutstation = useCallback((idx: number) => {
    setOutstationVisible((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setVisible(new Set(routes.map((_, i) => i)));
    setOutstationVisible(new Set(outstationRoutes.map((_, i) => i)));
  }, [routes, outstationRoutes]);

  const hideAll = useCallback(() => {
    setVisible(new Set());
    setOutstationVisible(new Set());
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h2 font-semibold">{t('map.title')}</h2>
        <div className="ms-auto flex gap-2">
          <button onClick={showAll} className="rounded-md bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80">
            {t('map.showAll')}
          </button>
          <button onClick={hideAll} className="rounded-md bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80">
            {t('map.hideAll')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {routes.map((route, i) => (
          <button
            key={`r-${i}`}
            onClick={() => toggleRoute(i)}
            className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: route.color,
              backgroundColor: visible.has(i) ? route.color + '20' : 'transparent',
              color: visible.has(i) ? route.color : 'var(--muted-foreground)',
            }}
          >
            {visible.has(i) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {t('map.routeLabel', { number: i + 1 })}
          </button>
        ))}
        {outstationRoutes.map((route, i) => (
          <button
            key={`o-${i}`}
            onClick={() => toggleOutstation(i)}
            className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: route.color,
              backgroundColor: outstationVisible.has(i) ? route.color + '20' : 'transparent',
              color: outstationVisible.has(i) ? route.color : 'var(--muted-foreground)',
            }}
          >
            {outstationVisible.has(i) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {t('routeCards.outstationLabel')} {i + 1}
          </button>
        ))}
      </div>

      <div className="h-[500px] overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={10}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {depotEditRoute !== null && onMapClick && (
            <MapClickHandler onMapClick={onMapClick} routeIndex={depotEditRoute} />
          )}

          {routes.map((route, ri) => {
            if (!visible.has(ri)) return null;
            return <RouteLayer key={`r-${ri}`} route={route} />;
          })}

          {outstationRoutes.map((route, oi) => {
            if (!outstationVisible.has(oi)) return null;
            return <RouteLayer key={`o-${oi}`} route={route} />;
          })}
        </MapContainer>
      </div>
    </div>
  );
}

function RouteLayer({ route }: { route: RouteResult }) {
  const pathPoints = useMemo(() => {
    const points: [number, number][] = [];
    for (const dp of route.dailyPlans) {
      if (route.depot) points.push([route.depot.lat, route.depot.lng]);
      for (const c of dp.sequencedCustomers) {
        points.push([c.lat, c.lng]);
      }
      if (route.depot) points.push([route.depot.lat, route.depot.lng]);
    }
    if (points.length === 0) {
      for (const c of route.customers) {
        points.push([c.lat, c.lng]);
      }
    }
    return points;
  }, [route]);

  const overallPath = useMemo(() => {
    if (route.dailyPlans.length > 0 && route.dailyPlans[0].sequencedCustomers.length > 0) {
      const dp = route.dailyPlans[0];
      const pts: [number, number][] = [];
      if (route.depot) pts.push([route.depot.lat, route.depot.lng]);
      for (const c of dp.sequencedCustomers) pts.push([c.lat, c.lng]);
      if (route.depot) pts.push([route.depot.lat, route.depot.lng]);
      return pts;
    }
    return pathPoints;
  }, [route, pathPoints]);

  return (
    <>
      {overallPath.length > 1 && (
        <Polyline
          positions={overallPath}
          color={route.color}
          weight={2.5}
          opacity={0.7}
          dashArray={route.routeType === 'outstation' ? '8 4' : undefined}
        />
      )}

      {route.customers.map((c) => (
        <CircleMarker
          key={c.index}
          center={[c.lat, c.lng]}
          radius={5}
          pathOptions={{ color: route.color, fillColor: route.color, fillOpacity: 0.8, weight: 1 }}
        >
          <Popup>
            <div className="text-xs">
              <strong>{c.customerNo}</strong>
              <br />
              {c.customerNameE || c.customerNameA}
              <br />
              {c.city}
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {route.depot && (
        <Marker position={[route.depot.lat, route.depot.lng]} icon={depotIcon}>
          <Popup>
            <div className="text-xs font-medium">Depot / Start Point</div>
          </Popup>
        </Marker>
      )}
    </>
  );
}
