import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Pencil, Plus } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { CategoryBadge } from '@/components/customers/CategoryBadge'
import { NavigateButton } from '@/components/nav/NavigateButton'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { useCustomerCovers, useSignedUrls } from '@/hooks/queries'
import { useLocation } from '@/hooks/useLocation'
import type { CustomerSummary } from '@/lib/api'
import { RECENCY_META, summaryRecency } from '@/lib/recency'
import { distanceMeters, formatDistance, formatDriveTime, hasCoords } from '@/lib/geo'
import { cn, formatDay } from '@/lib/utils'
import type { Customer } from '@/types'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-surface-2/70 px-3 py-2.5 text-center">
      <p className="text-[15px] font-bold">{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-ink-2">{label}</p>
    </div>
  )
}

/** Marker-tap card: identity, distance, last-visit, and quick actions. */
export function CustomerCardSheet({
  customer,
  summary,
  onClose,
}: {
  customer: Customer | null
  summary: CustomerSummary | undefined
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { location } = useLocation()

  const distance = useMemo(() => {
    if (!customer || !location || !hasCoords(customer)) return null
    return distanceMeters(location, customer)
  }, [customer, location])

  const covers = useCustomerCovers()
  const cover = customer ? covers.data?.[customer.id] : undefined
  const { data: coverUrls } = useSignedUrls(cover ? [cover.full] : [])
  const coverUrl = cover ? coverUrls?.[cover.full] : undefined

  if (!customer) return null
  const recency = summaryRecency(summary)
  const meta = RECENCY_META[recency]

  const go = (path: string) => {
    onClose()
    navigate(path)
  }

  return (
    <Sheet open={!!customer} onClose={onClose} title={customer.name}>
      <div className="space-y-4 pt-1">
        {coverUrl && (
          <PhotoImg
            url={coverUrl}
            alt={`${customer.name} store front`}
            className="aspect-[16/9] w-full rounded-card"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge customer={customer} size="md" />
          <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2')}>
            <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
            {meta.label}
          </span>
          {customer.code && (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">
              {customer.code}
            </span>
          )}
          {(customer.area || customer.city) && (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">
              {customer.area || customer.city}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Stat label="Distance" value={distance != null ? formatDistance(distance) : '—'} />
          <Stat label="Drive time" value={distance != null ? formatDriveTime(distance) : '—'} />
          <Stat label="Visits" value={String(summary?.visitCount ?? 0)} />
        </div>
        <div className="flex gap-2">
          <Stat
            label="Last visit"
            value={summary?.lastVisitedAt ? formatDay(summary.lastVisitedAt) : 'Never'}
          />
        </div>

        {customer.notes && (
          <div className="rounded-card bg-surface-2/70 px-4 py-3">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-2">Notes</p>
            <p className="whitespace-pre-wrap text-[14px] leading-snug">{customer.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {hasCoords(customer) && (
            <NavigateButton latitude={customer.latitude} longitude={customer.longitude} className="w-full" />
          )}
          <button
            onClick={() => go(`/visits/new?customer=${customer.id}`)}
            className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink"
          >
            <Plus size={17} />
            New Visit
          </button>
          <button
            onClick={() => go(`/customers/${customer.id}`)}
            className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink"
          >
            <BookOpen size={16} />
            History
          </button>
          <button
            onClick={() => go(`/customers/${customer.id}?edit=1`)}
            className="press flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink"
          >
            <Pencil size={15} />
            Edit
          </button>
        </div>
      </div>
    </Sheet>
  )
}
