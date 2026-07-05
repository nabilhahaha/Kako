import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Camera,
  ChevronRight,
  MapPin,
  Plus,
  Search as SearchIcon,
  Store,
  X,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { LoadMore } from '@/components/ui/LoadMore'
import { CategoryBadge } from '@/components/customers/CategoryBadge'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { useVisitThumbs } from '@/components/visits/VisitCard'
import { useVisits } from '@/hooks/queries'
import { useLocation } from '@/hooks/useLocation'
import { VISIT_STATUS_META, visitStatusLabel, visitTypeLabel } from '@/lib/constants'
import { distanceMeters, formatDistance, hasCoords } from '@/lib/geo'
import { cn, formatDay, formatTime, relativeAge } from '@/lib/utils'
import { VISIT_STATUSES, type Customer, type VisitStatus, type VisitWithMeta } from '@/types'

type StatusFilter = 'all' | VisitStatus
type Sort = 'newest' | 'oldest'

const STATUS_RING: Record<VisitStatus, string> = {
  excellent: 'bg-ios-green',
  good: 'bg-ios-blue',
  needs_follow_up: 'bg-ios-orange',
  urgent: 'bg-accent',
}

const FILTER_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...VISIT_STATUSES.map((s) => ({ value: s as StatusFilter, label: VISIT_STATUS_META[s].label })),
]

/** One premium timeline card for a single visit. */
function TimelineItem({
  visit,
  thumbUrl,
  customer,
  distanceLabel,
  isLast,
  index,
}: {
  visit: VisitWithMeta
  thumbUrl?: string
  customer: Customer
  distanceLabel?: string
  isLast: boolean
  index: number
}) {
  const meta = VISIT_STATUS_META[visit.status]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.03, duration: 0.28, ease: [0.32, 0.72, 0.32, 1] }}
      className="relative pl-7"
    >
      {/* Rail connector */}
      {!isLast && <span className="absolute left-[9px] top-5 bottom-0 w-[2px] bg-separator/70" />}
      {/* Status node */}
      <span
        className={cn(
          'absolute left-[3px] top-4 z-10 h-3.5 w-3.5 rounded-full ring-4 ring-bg',
          STATUS_RING[visit.status],
        )}
      />

      <Link
        to={`/visits/${visit.id}`}
        className="press mb-3 flex gap-3.5 rounded-card bg-surface p-3.5 shadow-card"
      >
        <div className="relative shrink-0">
          <PhotoImg
            url={thumbUrl}
            alt={customer.name}
            className="h-[76px] w-[76px] rounded-2xl"
          />
          {!thumbUrl && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-surface-2 text-ink-3">
              <Store size={24} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[15px] font-bold">{formatDay(visit.visited_at)}</p>
            <span className="shrink-0 text-[12px] font-medium text-ink-3">{formatTime(visit.visited_at)}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', meta.badge)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
              {meta.label}
            </span>
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
              {visitTypeLabel(visit.visit_type)}
            </span>
            <CategoryBadge customer={customer} />
          </div>

          {visit.notes && (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{visit.notes}</p>
          )}

          <div className="mt-2 flex items-center gap-3 text-[12px] font-semibold text-ink-3">
            <span className="inline-flex items-center gap-1">
              <Camera size={13} />
              {visit.photos.length} Photo{visit.photos.length === 1 ? '' : 's'}
            </span>
            {distanceLabel && (
              <span className="inline-flex items-center gap-1 text-ios-blue">
                <MapPin size={12} />
                {distanceLabel}
              </span>
            )}
            <ChevronRight size={16} className="ml-auto text-ink-3" />
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/**
 * Customer visit history as a modern vertical timeline: date separators, a
 * connector rail, status nodes, storefront thumbnails, search, status filter
 * chips and newest/oldest sorting. Paginated and offline-friendly via cached
 * React Query data.
 */
export function CustomerTimeline({ customer }: { customer: Customer }) {
  const navigate = useNavigate()
  const { location } = useLocation()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<Sort>('newest')

  // Only add keys that change the server query so the default view shares the
  // page's cached "newest, all" query (works offline).
  const filters = useMemo(
    () => ({
      customerId: customer.id,
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(sort === 'oldest' ? { sort: 'oldest' as const } : {}),
    }),
    [customer.id, statusFilter, sort],
  )

  const visits = useVisits(filters)
  const loaded = useMemo(
    () => visits.data?.pages.flatMap((p) => p.visits) ?? [],
    [visits.data],
  )
  const thumbs = useVisitThumbs(loaded)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return loaded
    return loaded.filter((v) =>
      [v.notes, visitTypeLabel(v.visit_type), visitStatusLabel(v.status)]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    )
  }, [loaded, search])

  const distanceFor = (visit: VisitWithMeta): string | undefined => {
    if (!location) return undefined
    const point = hasCoords(visit) ? visit : hasCoords(customer) ? customer : null
    if (!point) return undefined
    return formatDistance(distanceMeters(location, point))
  }

  // Loading skeleton (first load, nothing cached)
  if (visits.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[104px] rounded-card" />
        <Skeleton className="h-[104px] rounded-card" />
        <Skeleton className="h-[104px] rounded-card" />
      </div>
    )
  }

  // True empty state — customer has no visits at all
  if (loaded.length === 0 && statusFilter === 'all' && !search) {
    return (
      <EmptyState
        icon={Store}
        title="No visits yet"
        message={`Start documenting your visits to ${customer.name} — photos, notes and location in seconds.`}
        action={
          <button
            onClick={() => navigate(`/visits/new?customer=${customer.id}`)}
            className="press flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-[15px] font-bold text-white shadow-fab"
          >
            <Plus size={18} strokeWidth={2.4} />
            Create First Visit
          </button>
        }
      />
    )
  }

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes, type or status…"
          className="h-11 w-full rounded-2xl bg-surface-2 pl-10 pr-9 text-[15px] text-ink placeholder:text-ink-3 outline-none focus:bg-surface focus:ring-4 focus:ring-accent/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            aria-label="Clear search"
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-separator text-ink-2"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Filter chips + sort */}
      <div className="mb-4 flex items-center gap-2">
        <div className="no-scrollbar -mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-0.5">
          {FILTER_CHIPS.map((chip) => {
            const active = statusFilter === chip.value
            return (
              <button
                key={chip.value}
                onClick={() => setStatusFilter(chip.value)}
                className={cn(
                  'press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                  active ? 'bg-accent text-white shadow-card' : 'bg-surface-2 text-ink-2',
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
          className="press flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink-2"
          aria-label={`Sort ${sort === 'newest' ? 'oldest first' : 'newest first'}`}
        >
          {sort === 'newest' ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}
          {sort === 'newest' ? 'Newest' : 'Oldest'}
        </button>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[15px] font-semibold text-ink-2">No matching visits</p>
          <p className="mt-1 text-[13px] text-ink-3">Try a different search or filter.</p>
        </div>
      ) : (
        <div>
          {filtered.map((visit, i) => {
            const prev = filtered[i - 1]
            const dayLabel = formatDay(visit.visited_at)
            const showSep = !prev || formatDay(prev.visited_at) !== dayLabel
            const age = relativeAge(visit.visited_at)
            const isLast = i === filtered.length - 1
            return (
              <div key={visit.id}>
                {showSep && (
                  <div className="mb-2 mt-1 flex items-center gap-2 pl-7">
                    <span className="text-[13px] font-bold text-ink">{dayLabel}</span>
                    {age !== dayLabel && (
                      <span className="text-[12px] font-medium text-ink-3">· {age}</span>
                    )}
                  </div>
                )}
                <TimelineItem
                  visit={visit}
                  thumbUrl={thumbs(visit.id)}
                  customer={customer}
                  distanceLabel={distanceFor(visit)}
                  isLast={isLast}
                  index={i}
                />
              </div>
            )
          })}

          <LoadMore
            hasMore={!!visits.hasNextPage}
            loading={visits.isFetchingNextPage}
            onMore={() => visits.fetchNextPage()}
          />
        </div>
      )}
    </div>
  )
}
