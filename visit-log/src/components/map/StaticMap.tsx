import { ExternalLink, MapPin } from 'lucide-react'
import { googleMapsUrl } from '@/lib/utils'

const ZOOM = 16
const TILE = 256

/**
 * Lightweight map preview built from OpenStreetMap tiles — no SDK, no API
 * key. A 3×3 tile patch is positioned so the coordinate sits dead-center
 * under the pin.
 */
export function StaticMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const n = 2 ** ZOOM
  const xt = ((longitude + 180) / 360) * n
  const latRad = (latitude * Math.PI) / 180
  const yt = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const x0 = Math.floor(xt)
  const y0 = Math.floor(yt)
  const fx = (xt - x0) * TILE
  const fy = (yt - y0) * TILE

  const tiles: { key: string; url: string; left: number; top: number }[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = (((x0 + dx) % n) + n) % n
      const ty = y0 + dy
      if (ty < 0 || ty >= n) continue
      tiles.push({
        key: `${tx}-${ty}`,
        url: `https://tile.openstreetmap.org/${ZOOM}/${tx}/${ty}.png`,
        left: (dx + 1) * TILE,
        top: (dy + 1) * TILE,
      })
    }
  }

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <a
        href={googleMapsUrl(latitude, longitude)}
        target="_blank"
        rel="noreferrer"
        aria-label="Open location in Google Maps"
        className="relative block h-44 overflow-hidden bg-surface-2"
      >
        <div
          className="pointer-events-none absolute h-[768px] w-[768px] select-none dark:brightness-[0.82] dark:contrast-[1.05]"
          style={{
            left: `calc(50% - ${TILE + fx}px)`,
            top: `calc(50% - ${TILE + fy}px)`,
          }}
        >
          {tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              loading="lazy"
              className="absolute h-64 w-64 max-w-none"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
        </div>
        <MapPin
          size={34}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full fill-accent text-white drop-shadow-md"
          strokeWidth={1.4}
        />
      </a>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-[13px] text-ink-2">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </div>
        <a
          href={googleMapsUrl(latitude, longitude)}
          target="_blank"
          rel="noreferrer"
          className="press inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-[13px] font-semibold text-accent"
        >
          Google Maps
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  )
}
