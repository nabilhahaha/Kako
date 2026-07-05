import { useMemo, useState } from 'react'
import { CheckCircle2, MapPin, Navigation, Plus, SkipForward } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { NavigateButton } from '@/components/nav/NavigateButton'
import { useCustomers } from '@/hooks/queries'
import { useLocation } from '@/hooks/useLocation'
import { distanceMeters, formatDistance, formatDriveTime, hasCoords } from '@/lib/geo'

/**
 * Shown after a visit is saved (Feature 9). Suggests the nearest remaining
 * customer so the rep can chain visits without returning home; Skip advances to
 * the next nearest.
 */
export function NextCustomerSheet({
  open,
  onClose,
  excludeIds,
  onStartVisit,
}: {
  open: boolean
  onClose: () => void
  excludeIds: string[]
  onStartVisit: (customerId: string) => void
}) {
  const { location } = useLocation()
  const customers = useCustomers()
  const [index, setIndex] = useState(0)

  const ranked = useMemo(() => {
    if (!location) return []
    const excluded = new Set(excludeIds)
    return (customers.data ?? [])
      .filter(hasCoords)
      .filter((c) => !excluded.has(c.id))
      .map((c) => ({ customer: c, meters: distanceMeters(location, c) }))
      .sort((a, b) => a.meters - b.meters)
  }, [customers.data, location, excludeIds])

  const current = ranked[index]

  return (
    <Sheet open={open} onClose={onClose} title="Visit Saved">
      <div className="space-y-5 pt-1">
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-ios-green/15 text-ios-green">
            <CheckCircle2 size={30} />
          </span>
          <p className="text-[15px] font-medium text-ink-2">
            {current ? 'Next nearest customer' : 'All nearby customers visited'}
          </p>
        </div>

        {current ? (
          <>
            <div className="rounded-card bg-surface-2/70 p-4">
              <p className="text-[19px] font-bold">{current.customer.name}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] font-medium text-ink-2">
                <span className="inline-flex items-center gap-1 text-accent">
                  <MapPin size={14} />
                  {formatDistance(current.meters)}
                </span>
                <span>~{formatDriveTime(current.meters)} drive</span>
                {(current.customer.area || current.customer.city) && (
                  <span>{current.customer.area || current.customer.city}</span>
                )}
              </div>
            </div>

            <div className="flex gap-2.5">
              <NavigateButton
                latitude={current.customer.latitude!}
                longitude={current.customer.longitude!}
                className="flex-1"
              />
              <button
                onClick={() => setIndex((i) => i + 1)}
                disabled={index >= ranked.length - 1}
                className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 px-4 text-[15px] font-semibold text-ink disabled:opacity-40"
              >
                <SkipForward size={16} />
                Skip
              </button>
            </div>
            <Button size="lg" full onClick={() => onStartVisit(current.customer.id)}>
              <Plus size={19} strokeWidth={2.4} />
              Start Visit
            </Button>
          </>
        ) : (
          <p className="px-2 text-center text-[14px] text-ink-2">
            {location
              ? 'No more customers with coordinates nearby.'
              : 'Enable location to see your next nearest customer.'}
          </p>
        )}

        <button
          onClick={onClose}
          className="press flex w-full items-center justify-center gap-1.5 py-2 text-[15px] font-semibold text-ios-blue"
        >
          <Navigation size={15} className="rotate-90" />
          Done for now
        </button>
      </div>
    </Sheet>
  )
}
