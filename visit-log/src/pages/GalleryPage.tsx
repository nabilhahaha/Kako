import { useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Images, ListFilter, Store, X } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { OptionSheet } from '@/components/ui/OptionSheet'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { LoadMore } from '@/components/ui/LoadMore'
import { PhotoImg } from '@/components/photos/PhotoImg'
import { Lightbox } from '@/components/photos/Lightbox'
import { CustomerPicker } from '@/components/customers/CustomerPicker'
import { useCustomers, useGallery, useSignedUrls } from '@/hooks/queries'
import { VISIT_STATUS_META, VISIT_TYPE_META } from '@/lib/constants'
import { cn, formatDate } from '@/lib/utils'
import type { GalleryFilters } from '@/lib/api'
import { VISIT_STATUSES, VISIT_TYPES, type VisitStatus, type VisitType } from '@/types'

const typeOptions = VISIT_TYPES.map((type) => ({
  value: type,
  label: VISIT_TYPE_META[type].label,
  icon: VISIT_TYPE_META[type].icon,
}))

const statusOptions = VISIT_STATUSES.map((status) => ({
  value: status,
  label: VISIT_STATUS_META[status].label,
}))

function FilterChip({
  label,
  active,
  onClick,
  onClear,
  icon: Icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  onClear: () => void
  icon: typeof Store
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center overflow-hidden rounded-full text-[13px] font-semibold transition-colors',
        active ? 'bg-accent text-white' : 'bg-surface text-ink-2 shadow-card',
      )}
    >
      <button onClick={onClick} className="flex items-center gap-1.5 py-2 pl-3.5 pr-2">
        <Icon size={14} />
        {label}
        {!active && <ChevronDown size={13} />}
      </button>
      {active && (
        <button onClick={onClear} aria-label={`Clear ${label} filter`} className="py-2 pl-0.5 pr-3">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function GalleryPage() {
  const [filters, setFilters] = useState<GalleryFilters>({})
  const [customerOpen, setCustomerOpen] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const customersQuery = useCustomers()
  const customers = customersQuery.data ?? []
  const gallery = useGallery(filters)
  const photos = useMemo(
    () => gallery.data?.pages.flatMap((page) => page.photos) ?? [],
    [gallery.data],
  )
  const paths = useMemo(() => photos.map((photo) => photo.storage_path), [photos])
  const { data: urls } = useSignedUrls(paths)

  const selectedCustomer = customers.find((c) => c.id === filters.customerId)

  const set = (patch: Partial<GalleryFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))

  return (
    <Page title="Gallery">
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip
          icon={Store}
          label={selectedCustomer ? selectedCustomer.name : 'Customer'}
          active={!!filters.customerId}
          onClick={() => setCustomerOpen(true)}
          onClear={() => set({ customerId: undefined })}
        />
        <FilterChip
          icon={CalendarDays}
          label={filters.date ? formatDate(`${filters.date}T12:00:00`) : 'Date'}
          active={!!filters.date}
          onClick={() => setDateOpen(true)}
          onClear={() => set({ date: undefined })}
        />
        <FilterChip
          icon={ListFilter}
          label={
            filters.visitType ? VISIT_TYPE_META[filters.visitType as VisitType].label : 'Type'
          }
          active={!!filters.visitType}
          onClick={() => setTypeOpen(true)}
          onClear={() => set({ visitType: undefined })}
        />
        <FilterChip
          icon={ListFilter}
          label={
            filters.status ? VISIT_STATUS_META[filters.status as VisitStatus].label : 'Status'
          }
          active={!!filters.status}
          onClick={() => setStatusOpen(true)}
          onClear={() => set({ status: undefined })}
        />
      </div>

      {gallery.isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <EmptyState
          icon={Images}
          title="No photos"
          message={
            Object.values(filters).some(Boolean)
              ? 'No photos match these filters — try clearing some.'
              : 'Photos from your visits will build a gallery here.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo, index) => (
              <PhotoImg
                key={photo.id}
                url={urls?.[photo.storage_path]}
                alt={photo.visit.customer?.name ?? 'Visit photo'}
                className="aspect-square cursor-pointer rounded-2xl"
                onClick={() => setLightboxIndex(index)}
              />
            ))}
          </div>
          <LoadMore
            hasMore={!!gallery.hasNextPage}
            loading={gallery.isFetchingNextPage}
            onMore={() => gallery.fetchNextPage()}
          />
        </>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          photos={photos.map((photo) => ({
            id: photo.id,
            url: urls?.[photo.storage_path],
            caption: `${photo.visit.customer?.name ?? 'Visit'} — ${formatDate(photo.visit.visited_at)}`,
          }))}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <CustomerPicker
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        customers={customers}
        onSelect={(customer) => set({ customerId: customer.id })}
      />
      <OptionSheet
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        title="Visit Type"
        options={typeOptions}
        value={filters.visitType as VisitType | undefined}
        onSelect={(next) => set({ visitType: next })}
        allowClear="All types"
      />
      <OptionSheet
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Visit Status"
        options={statusOptions}
        value={filters.status as VisitStatus | undefined}
        onSelect={(next) => set({ status: next })}
        allowClear="All statuses"
      />
      <Sheet open={dateOpen} onClose={() => setDateOpen(false)} title="Filter by Date">
        <div className="space-y-4 pt-2">
          <input
            type="date"
            value={filters.date ?? ''}
            onChange={(event) => set({ date: event.target.value || undefined })}
            className="h-12 w-full rounded-2xl bg-surface-2 px-4 text-[16px] font-semibold outline-none"
          />
          <div className="flex gap-3">
            <Button
              variant="ghost"
              full
              onClick={() => {
                set({ date: undefined })
                setDateOpen(false)
              }}
            >
              Clear
            </Button>
            <Button full onClick={() => setDateOpen(false)}>
              Apply
            </Button>
          </div>
        </div>
      </Sheet>
    </Page>
  )
}
