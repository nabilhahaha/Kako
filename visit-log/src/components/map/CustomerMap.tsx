import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import '@/components/map/map.css'
import type { Customer } from '@/types'
import type { CustomerSummary } from '@/lib/api'
import { RECENCY_META, summaryRecency, type Recency } from '@/lib/recency'
import type { LatLng } from '@/lib/geo'

export interface MappedCustomer {
  customer: Customer & { latitude: number; longitude: number }
  recency: Recency
}

// One divIcon per recency band, reused across all markers of that colour.
const iconCache = new Map<Recency, L.DivIcon>()
function markerIcon(recency: Recency): L.DivIcon {
  const cached = iconCache.get(recency)
  if (cached) return cached
  const color = RECENCY_META[recency].color
  const icon = L.divIcon({
    className: 'vl-marker',
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:50%;
      background:${color};border:2.5px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,.35);"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
  iconCache.set(recency, icon)
  return icon
}

// iOS-flavoured cluster bubble, sized/tinted by how many markers it holds.
function clusterIcon(cluster: { getChildCount: () => number }): L.DivIcon {
  const count = cluster.getChildCount()
  const size = count < 10 ? 38 : count < 100 ? 46 : count < 1000 ? 54 : 62
  return L.divIcon({
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;border-radius:50%;
      background:rgba(227,6,19,.92);color:#fff;font-weight:700;
      font-size:${count < 1000 ? 14 : 12}px;border:3px solid rgba(255,255,255,.9);
      box-shadow:0 3px 10px rgba(227,6,19,.4);">${count}</div>`,
    className: 'vl-cluster',
    iconSize: [size, size],
  })
}

function Recenter({ target, trigger }: { target: LatLng | null; trigger: number }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 14), { duration: 0.8 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])
  return null
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || points.length === 0) return
    done.current = true
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 14)
    } else {
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])),
        { padding: [48, 48], maxZoom: 15 },
      )
    }
  }, [points, map])
  return null
}

export function CustomerMap({
  markers,
  location,
  recenterTrigger,
  onSelect,
}: {
  markers: MappedCustomer[]
  location: LatLng | null
  recenterTrigger: number
  onSelect: (customer: Customer) => void
}) {
  const center = useMemo<[number, number]>(() => {
    if (location) return [location.latitude, location.longitude]
    if (markers.length) return [markers[0].customer.latitude, markers[0].customer.longitude]
    return [21.5611, 39.3164] // Jeddah fallback
  }, [location, markers])

  const fitPoints = useMemo(
    () => (location ? [] : markers.map((m) => ({ latitude: m.customer.latitude, longitude: m.customer.longitude }))),
    [location, markers],
  )

  return (
    <MapContainer
      center={center}
      zoom={13}
      zoomControl={false}
      preferCanvas
      className="h-full w-full"
      style={{ background: 'rgb(var(--c-surface-2))' }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap"
        maxZoom={19}
      />
      <Recenter target={location} trigger={recenterTrigger} />
      {fitPoints.length > 0 && <FitBounds points={fitPoints} />}

      {location && (
        <Marker
          position={[location.latitude, location.longitude]}
          icon={L.divIcon({
            className: 'vl-me',
            html: `<span style="display:block;width:16px;height:16px;border-radius:50%;
              background:#007AFF;border:3px solid #fff;box-shadow:0 0 0 6px rgba(0,122,255,.22);"></span>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          })}
          interactive={false}
          keyboard={false}
        />
      )}

      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={60}
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        removeOutsideVisibleBounds
        iconCreateFunction={clusterIcon}
      >
        {markers.map(({ customer, recency }) => (
          <Marker
            key={customer.id}
            position={[customer.latitude, customer.longitude]}
            icon={markerIcon(recency)}
            eventHandlers={{ click: () => onSelect(customer) }}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}

export function toMapped(
  customers: Customer[],
  summaries: Record<string, CustomerSummary> | undefined,
): MappedCustomer[] {
  const out: MappedCustomer[] = []
  for (const customer of customers) {
    if (customer.latitude == null || customer.longitude == null) continue
    out.push({
      customer: customer as MappedCustomer['customer'],
      recency: summaryRecency(summaries?.[customer.id]),
    })
  }
  return out
}
