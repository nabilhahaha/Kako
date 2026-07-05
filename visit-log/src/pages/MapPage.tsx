import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Car, ChevronDown, Crosshair, Layers, MapPinOff, X } from 'lucide-react'
import { CustomerMap, toMapped } from '@/components/map/CustomerMap'
import { CustomerCardSheet } from '@/components/map/CustomerCardSheet'
import { RouteSheet } from '@/components/map/RouteSheet'
import { MAP_FILTERS, matchesFilter, type MapFilterId } from '@/components/map/MapFilters'
import { RECENCY_META } from '@/lib/recency'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { OptionSheet } from '@/components/ui/OptionSheet'
import { useCustomers, useCustomerSummaries } from '@/hooks/queries'
import { useAdminScope } from '@/hooks/useAdminScope'
import { useLocation } from '@/hooks/useLocation'
import { CUSTOMER_CATEGORY_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { hasCoords } from '@/lib/geo'
import { CUSTOMER_CATEGORIES, type Customer, type CustomerCategory } from '@/types'

const categoryOptions = CUSTOMER_CATEGORIES.map((value) => ({
  value,
  label: CUSTOMER_CATEGORY_LABELS[value],
}))

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface/90 px-3 py-2 text-[11px] font-semibold text-ink-2 shadow-card backdrop-blur">
      {(['today', 'week', 'stale', 'never'] as const).map((r) => (
        <span key={r} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-full ring-2 ring-white', RECENCY_META[r].dot)} />
          {RECENCY_META[r].label}
        </span>
      ))}
    </div>
  )
}

export function MapPage() {
  const { location, status, refresh } = useLocation()
  const customers = useCustomers()
  const summaries = useCustomerSummaries()
  const { isAdmin, salespeople, scopeUserId, setScopeUserId } = useAdminScope()
  const [filter, setFilter] = useState<MapFilterId>('all')
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategory | undefined>()
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [routeOpen, setRouteOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [recenterTrigger, setRecenterTrigger] = useState(0)

  const mappable = useMemo(
    () => (customers.data ?? []).filter(hasCoords),
    [customers.data],
  )

  const filtered = useMemo(() => {
    const data = customers.data ?? []
    const byFilter = data.filter(
      (c) =>
        matchesFilter(filter, summaries.data?.[c.id]) &&
        (!categoryFilter || c.customer_category === categoryFilter),
    )
    return toMapped(byFilter, summaries.data)
  }, [customers.data, summaries.data, filter, categoryFilter])

  // The Route Assistant respects the active category filter too.
  const routeCustomers = useMemo(
    () => (categoryFilter ? mappable.filter((c) => c.customer_category === categoryFilter) : mappable),
    [mappable, categoryFilter],
  )

  const recenter = () => {
    refresh()
    setRecenterTrigger((n) => n + 1)
  }

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Filters */}
      <div className="glass z-20 pt-safe">
        <div className="flex h-[52px] items-center px-4">
          <h1 className="text-[17px] font-bold">Map</h1>
          <span className="ml-auto text-[13px] font-medium text-ink-2">
            {filtered.length} of {mappable.length}
          </span>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5">
          <div
            className={cn(
              'flex shrink-0 items-center overflow-hidden rounded-full text-[13px] font-semibold',
              categoryFilter ? 'bg-accent text-white shadow-fab' : 'bg-surface text-ink-2 shadow-card',
            )}
          >
            <button onClick={() => setCategoryOpen(true)} className="flex items-center gap-1 py-1.5 pl-3.5 pr-2">
              {categoryFilter ? CUSTOMER_CATEGORY_LABELS[categoryFilter] : 'Category'}
              {!categoryFilter && <ChevronDown size={13} />}
            </button>
            {categoryFilter && (
              <button
                onClick={() => setCategoryFilter(undefined)}
                aria-label="Clear category filter"
                className="py-1.5 pl-0.5 pr-3"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {MAP_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                filter === f.id ? 'bg-accent text-white shadow-fab' : 'bg-surface text-ink-2 shadow-card',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5">
            {[{ id: null as string | null, label: 'All Salespeople' }]
              .concat(salespeople.map((p) => ({ id: p.id, label: p.full_name || p.email?.split('@')[0] || 'Salesperson' })))
              .map((chip) => (
                <button
                  key={chip.id ?? 'all'}
                  onClick={() => setScopeUserId(chip.id)}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                    scopeUserId === chip.id ? 'bg-ios-blue text-white shadow-fab' : 'bg-surface text-ink-2 shadow-card',
                  )}
                >
                  {chip.label}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1">
        {customers.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : mappable.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MapPinOff}
              title="No mapped customers"
              message="Customers with GPS coordinates will appear here. Add coordinates when editing a customer or importing."
            />
          </div>
        ) : (
          <>
            <CustomerMap
              markers={filtered}
              location={location}
              recenterTrigger={recenterTrigger}
              onSelect={setSelected}
            />

            {/* Legend */}
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center px-4">
              {legendOpen && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-auto">
                  <Legend />
                </motion.div>
              )}
            </div>

            {/* Controls */}
            <div className="absolute bottom-24 right-4 z-[500] flex flex-col gap-2.5">
              <button
                onClick={() => setLegendOpen((v) => !v)}
                aria-label="Toggle legend"
                className={cn(
                  'press flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink shadow-card-lg',
                  legendOpen && 'text-accent',
                )}
              >
                <Layers size={19} />
              </button>
              <button
                onClick={recenter}
                aria-label="Recenter on my location"
                className={cn(
                  'press flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-card-lg',
                  status === 'granted' ? 'text-ios-blue' : 'text-ink-3',
                )}
              >
                <Crosshair size={20} />
              </button>
            </div>

            {/* Route Assistant FAB */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setRouteOpen(true)}
              className="absolute bottom-24 left-4 z-[500] flex h-12 items-center gap-2 rounded-full bg-accent px-4 text-[15px] font-bold text-white shadow-fab"
            >
              <Car size={19} />
              Start Route
            </motion.button>
          </>
        )}
      </div>

      <CustomerCardSheet
        customer={selected}
        summary={selected ? summaries.data?.[selected.id] : undefined}
        onClose={() => setSelected(null)}
      />
      <RouteSheet open={routeOpen} onClose={() => setRouteOpen(false)} customers={routeCustomers} />
      <OptionSheet
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="Filter by Category"
        options={categoryOptions}
        value={categoryFilter}
        onSelect={setCategoryFilter}
        allowClear="All Categories"
      />
    </div>
  )
}
