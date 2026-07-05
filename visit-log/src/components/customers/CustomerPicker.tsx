import { useMemo, useState } from 'react'
import { MapPin, Navigation, Plus, Store } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { useLocation } from '@/hooks/useLocation'
import { distanceMeters, formatDistance, hasCoords } from '@/lib/geo'
import { categoryLabel } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Customer } from '@/types'

export function filterCustomers(customers: Customer[], term: string): Customer[] {
  const query = term.trim().toLowerCase()
  if (!query) return customers
  return customers.filter((customer) =>
    [customer.name, customer.code, customer.city, customer.area, customer.phone, categoryLabel(customer)]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(query)),
  )
}

const NEARBY_COUNT = 8

function CustomerRow({
  customer,
  distanceLabel,
  onClick,
}: {
  customer: Customer
  distanceLabel?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-separator/60 px-4 py-3.5 text-left last:border-b-0 active:bg-surface-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-[15px] font-bold text-accent">
        {customer.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{customer.name}</span>
        <span className="block truncate text-[13px] text-ink-2">
          {[customer.code, customer.city, customer.area].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>
      {distanceLabel && (
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-accent">
          <Navigation size={12} className="fill-current" />
          {distanceLabel}
        </span>
      )}
    </button>
  )
}

/**
 * Customer selector. When location is available and no search is active, a
 * distance-sorted "Nearby Customers" section sits above the alphabetical list;
 * without location it falls back to plain alphabetical order.
 */
export function CustomerPicker({
  open,
  onClose,
  customers,
  onSelect,
  onCreateNew,
}: {
  open: boolean
  onClose: () => void
  customers: Customer[]
  onSelect: (customer: Customer) => void
  onCreateNew?: () => void
}) {
  const [term, setTerm] = useState('')
  const { location } = useLocation()
  const filtered = useMemo(() => filterCustomers(customers, term), [customers, term])

  const withDistance = useMemo(() => {
    if (!location) return new Map<string, number>()
    const map = new Map<string, number>()
    for (const customer of customers) {
      if (hasCoords(customer)) map.set(customer.id, distanceMeters(location, customer))
    }
    return map
  }, [customers, location])

  const nearby = useMemo(() => {
    if (!location || term.trim()) return []
    return customers
      .filter(hasCoords)
      .map((customer) => ({ customer, meters: withDistance.get(customer.id)! }))
      .sort((a, b) => a.meters - b.meters)
      .slice(0, NEARBY_COUNT)
  }, [customers, location, term, withDistance])

  const pick = (customer: Customer) => {
    onSelect(customer)
    setTerm('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Select Customer" tall>
      <div className="sticky top-0 z-10 -mx-1 bg-surface px-1 pb-3">
        <SearchInput value={term} onChange={setTerm} placeholder="Name, code, city…" />
      </div>
      {onCreateNew && (
        <button
          onClick={onCreateNew}
          className="press mb-3 flex w-full items-center gap-3 rounded-card bg-accent-soft px-4 py-3.5 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
            <Plus size={18} />
          </span>
          <span className="text-[15px] font-bold text-accent">Add New Customer</span>
        </button>
      )}

      {nearby.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-bold text-ink-2">
            <MapPin size={14} className="text-accent" />
            Nearby Customers
          </p>
          <div className="overflow-hidden rounded-card bg-surface-2/60">
            {nearby.map(({ customer, meters }) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                distanceLabel={formatDistance(meters)}
                onClick={() => pick(customer)}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title={term ? 'No matches' : 'No customers yet'}
          message={
            term ? 'Try a different name, code or city.' : 'Add customers manually or import them from Excel.'
          }
        />
      ) : (
        <div>
          {nearby.length > 0 && (
            <p className={cn('mb-2 px-1 text-[13px] font-bold text-ink-2')}>All Customers</p>
          )}
          <div className="overflow-hidden rounded-card bg-surface-2/60">
            {filtered.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                distanceLabel={
                  withDistance.has(customer.id) ? formatDistance(withDistance.get(customer.id)!) : undefined
                }
                onClick={() => pick(customer)}
              />
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}
