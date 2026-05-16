import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Customer, Visit } from '@/lib/types';

// Fix Leaflet default icon URLs for Vite bundling.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const GRADE_COLOR: Record<string, string> = {
  A: '#10B981',
  B: '#F59E0B',
  C: '#9CA3AF',
};

interface LiveMapProps {
  customers: Customer[];
  recentVisits: Visit[];
  repsById: Map<string, { name: string }>;
}

interface RepPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  visitedAt: string;
}

const JEDDAH: [number, number] = [21.4858, 39.1925];

export function LiveMap({ customers, recentVisits, repsById }: LiveMapProps) {
  const repPins = useMemo<RepPin[]>(() => {
    const latest = new Map<string, Visit>();
    for (const v of recentVisits) {
      if (v.latitude == null || v.longitude == null) continue;
      if (!latest.has(v.user_id)) latest.set(v.user_id, v);
    }
    return Array.from(latest.values()).map((v) => ({
      id: v.user_id,
      name: repsById.get(v.user_id)?.name ?? 'مندوب',
      lat: v.latitude!,
      lng: v.longitude!,
      visitedAt: v.visited_at,
    }));
  }, [recentVisits, repsById]);

  const center: [number, number] = useMemo(() => {
    if (repPins.length) return [repPins[0].lat, repPins[0].lng];
    const c = customers.find((x) => x.latitude != null && x.longitude != null);
    if (c) return [c.latitude!, c.longitude!];
    return JEDDAH;
  }, [repPins, customers]);

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom
      className="h-[calc(100vh-12rem)] w-full overflow-hidden rounded-xl border border-border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {customers.map((c) =>
        c.latitude != null && c.longitude != null ? (
          <CircleMarker
            key={c.id}
            center={[c.latitude, c.longitude]}
            radius={7}
            pathOptions={{
              color: GRADE_COLOR[c.customer_grade ?? 'C'] ?? GRADE_COLOR.C,
              fillColor: GRADE_COLOR[c.customer_grade ?? 'C'] ?? GRADE_COLOR.C,
              fillOpacity: 0.65,
              weight: 2,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm" dir="rtl">
                <p className="font-medium">
                  {c.customer_name_ar || c.customer_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.customer_code} · Grade {c.customer_grade}
                </p>
                {c.channel_type && (
                  <p className="text-xs text-muted-foreground">{c.channel_type}</p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ) : null,
      )}

      {repPins.map((r) => (
        <Marker key={r.id} position={[r.lat, r.lng]}>
          <Popup>
            <div className="space-y-1 text-sm" dir="rtl">
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                آخر موقع: {new Date(r.visitedAt).toLocaleString('ar-SA')}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
