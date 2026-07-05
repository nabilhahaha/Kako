import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPinned, Navigation, Route } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useLocation } from '@/hooks/useLocation'
import {
  formatDistance,
  formatDriveTime,
  googleMapsRouteUrl,
  hasCoords,
  nearestCustomers,
  openExternal,
} from '@/lib/geo'
import type { Customer } from '@/types'

const ROUTE_SIZE = 10

/**
 * Auto-builds a driving route through the nearest customers and hands it to
 * Google Maps as a multi-stop directions link.
 */
export function RouteSheet({
  open,
  onClose,
  customers,
}: {
  open: boolean
  onClose: () => void
  customers: Customer[]
}) {
  const navigate = useNavigate()
  const { location } = useLocation()

  const stops = useMemo(() => {
    if (!location) return []
    const mappable = customers.filter(hasCoords)
    return nearestCustomers(location, mappable, ROUTE_SIZE)
  }, [location, customers])

  const totalMeters = stops.reduce((sum, s) => sum + s.meters, 0)

  const startRoute = () => {
    if (!location || stops.length === 0) return
    openExternal(googleMapsRouteUrl(stops.map((s) => s.item), location))
  }

  return (
    <Sheet open={open} onClose={onClose} title="Start Route" tall>
      {!location ? (
        <EmptyState
          icon={Navigation}
          title="Location needed"
          message="Enable location to build a route to your nearest customers."
        />
      ) : stops.length === 0 ? (
        <EmptyState
          icon={MapPinned}
          title="No customers to route"
          message="Add customers with GPS coordinates to plan a route."
        />
      ) : (
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between rounded-card bg-accent-soft px-4 py-3">
            <div>
              <p className="text-[15px] font-bold text-accent">
                {stops.length} nearest customers
              </p>
              <p className="text-[13px] font-medium text-accent/80">
                ~{formatDistance(totalMeters)} · {formatDriveTime(totalMeters)} total
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-white">
              <Route size={19} />
            </span>
          </div>

          <div className="overflow-hidden rounded-card bg-surface-2/60">
            {stops.map((stop, index) => (
              <button
                key={stop.item.id}
                onClick={() => {
                  onClose()
                  navigate(`/customers/${stop.item.id}`)
                }}
                className="flex w-full items-center gap-3 border-b border-separator/60 px-4 py-3 text-left last:border-b-0 active:bg-surface-2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{stop.item.name}</span>
                  <span className="block truncate text-[13px] text-ink-2">
                    {[stop.item.area || stop.item.city, stop.item.code].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-accent">
                  {formatDistance(stop.meters)}
                </span>
              </button>
            ))}
          </div>

          <Button size="lg" full onClick={startRoute}>
            <Navigation size={19} className="fill-current" />
            Start Route in Google Maps
          </Button>
        </div>
      )}
    </Sheet>
  )
}
