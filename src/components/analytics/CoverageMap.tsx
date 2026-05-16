import { useMemo } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Customer } from '@/lib/types';

const GRADE_COLOR: Record<string, string> = {
  A: '#10B981',
  B: '#F59E0B',
  C: '#9CA3AF',
};

const JEDDAH: [number, number] = [21.4858, 39.1925];

interface CoverageMapProps {
  customers: Customer[];
  height?: string;
}

export function CoverageMap({ customers, height = 'h-[calc(100vh-14rem)]' }: CoverageMapProps) {
  const center: [number, number] = useMemo(() => {
    const first = customers.find((c) => c.latitude != null && c.longitude != null);
    return first ? [first.latitude!, first.longitude!] : JEDDAH;
  }, [customers]);

  return (
    <div className={`${height} w-full overflow-hidden rounded-xl border border-border`}>
      <MapContainer center={center} zoom={10} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {customers.map((c) =>
          c.latitude != null && c.longitude != null ? (
            <CircleMarker
              key={c.id}
              center={[c.latitude, c.longitude]}
              radius={6}
              pathOptions={{
                color: GRADE_COLOR[c.customer_grade ?? 'C'] ?? GRADE_COLOR.C,
                fillColor: GRADE_COLOR[c.customer_grade ?? 'C'] ?? GRADE_COLOR.C,
                fillOpacity: 0.7,
                weight: 1.5,
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
      </MapContainer>
    </div>
  );
}
