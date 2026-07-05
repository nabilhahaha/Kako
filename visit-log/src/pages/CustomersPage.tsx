import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileUp, Plus, Store, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { Page, HeaderIconButton } from '@/components/layout/Page'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { OptionSheet } from '@/components/ui/OptionSheet'
import { CustomerForm } from '@/components/customers/CustomerForm'
import { CategoryBadge } from '@/components/customers/CategoryBadge'
import { CustomerAvatar, useCustomerThumbUrls } from '@/components/customers/CustomerAvatar'
import { ImportSheet } from '@/components/customers/ImportSheet'
import { filterCustomers } from '@/components/customers/CustomerPicker'
import { useCustomers } from '@/hooks/queries'
import { CUSTOMER_CATEGORY_LABELS, DISTRIBUTOR_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { CUSTOMER_CATEGORIES, DISTRIBUTORS, type CustomerCategory, type Distributor } from '@/types'

const categoryOptions = CUSTOMER_CATEGORIES.map((value) => ({
  value,
  label: CUSTOMER_CATEGORY_LABELS[value],
}))
const distributorOptions = DISTRIBUTORS.map((value) => ({ value, label: DISTRIBUTOR_LABELS[value] }))
const roshenOptions = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
]

/** A compact filter chip that opens an OptionSheet. */
function FilterChip({
  active,
  label,
  onOpen,
  onClear,
}: {
  active: boolean
  label: string
  onOpen: () => void
  onClear: () => void
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center overflow-hidden rounded-full text-[13px] font-semibold',
        active ? 'bg-accent text-white' : 'bg-surface text-ink-2 shadow-card',
      )}
    >
      <button onClick={onOpen} className="flex items-center gap-1.5 py-2 pl-3.5 pr-2">
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

export function CustomersPage() {
  const customers = useCustomers()
  const [term, setTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategory | undefined>()
  const [roshenFilter, setRoshenFilter] = useState<'yes' | 'no' | undefined>()
  const [distributorFilter, setDistributorFilter] = useState<Distributor | undefined>()
  const [sheet, setSheet] = useState<null | 'category' | 'roshen' | 'distributor'>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const filtered = useMemo(() => {
    let list = customers.data ?? []
    if (categoryFilter) list = list.filter((c) => c.customer_category === categoryFilter)
    if (roshenFilter) list = list.filter((c) => (c.roshen_available ? 'yes' : 'no') === roshenFilter)
    if (distributorFilter) list = list.filter((c) => c.distributor === distributorFilter)
    return filterCustomers(list, term)
  }, [customers.data, term, categoryFilter, roshenFilter, distributorFilter])

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered])
  const resolveThumb = useCustomerThumbUrls(filteredIds)

  return (
    <Page
      title="Customers"
      actions={
        <>
          <HeaderIconButton onClick={() => setImportOpen(true)} label="Import from Excel">
            <FileUp size={19} />
          </HeaderIconButton>
          <HeaderIconButton onClick={() => setFormOpen(true)} label="Add customer">
            <Plus size={21} />
          </HeaderIconButton>
        </>
      }
    >
      <SearchInput
        value={term}
        onChange={setTerm}
        placeholder="Search name, code, city, category…"
        className="mb-3"
      />
      <div className="no-scrollbar mb-4 flex items-center gap-2 overflow-x-auto pb-0.5">
        <FilterChip
          active={!!categoryFilter}
          label={categoryFilter ? CUSTOMER_CATEGORY_LABELS[categoryFilter] : 'Category'}
          onOpen={() => setSheet('category')}
          onClear={() => setCategoryFilter(undefined)}
        />
        <FilterChip
          active={!!roshenFilter}
          label={roshenFilter ? `Roshen: ${roshenFilter === 'yes' ? 'Yes' : 'No'}` : 'Roshen'}
          onOpen={() => setSheet('roshen')}
          onClear={() => setRoshenFilter(undefined)}
        />
        <FilterChip
          active={!!distributorFilter}
          label={distributorFilter ? DISTRIBUTOR_LABELS[distributorFilter] : 'Distributor'}
          onOpen={() => setSheet('distributor')}
          onClear={() => setDistributorFilter(undefined)}
        />
      </div>

      {customers.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title={term ? 'No matches' : 'No customers yet'}
          message={
            term
              ? 'Try a different name, code or city.'
              : 'Build your customer database — add them one by one or import from Excel.'
          }
          action={
            !term && (
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <FileUp size={16} />
                  Import Excel
                </Button>
                <Button onClick={() => setFormOpen(true)}>
                  <Plus size={17} />
                  Add Customer
                </Button>
              </div>
            )
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {filtered.map((customer, index) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(index, 12) * 0.02 }}
              >
                <Link
                  to={`/customers/${customer.id}`}
                  className="flex items-center gap-3 border-b border-separator/60 px-4 py-3.5 last:border-b-0 active:bg-surface-2"
                >
                  <CustomerAvatar
                    customer={customer}
                    thumbUrl={resolveThumb(customer.id)}
                    className="h-11 w-11 text-[16px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold">
                      {customer.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <CategoryBadge customer={customer} />
                      <span className="truncate text-[13px] text-ink-2">
                        {[customer.code, customer.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-ink-3" />
                </Link>
              </motion.div>
            ))}
          </div>
          <p className="mt-3 text-center text-[13px] font-medium text-ink-3">
            {filtered.length} customer{filtered.length === 1 ? '' : 's'}
          </p>
        </>
      )}

      <CustomerForm open={formOpen} onClose={() => setFormOpen(false)} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
      <OptionSheet
        open={sheet === 'category'}
        onClose={() => setSheet(null)}
        title="Filter by Category"
        options={categoryOptions}
        value={categoryFilter}
        onSelect={setCategoryFilter}
        allowClear="All Categories"
      />
      <OptionSheet
        open={sheet === 'roshen'}
        onClose={() => setSheet(null)}
        title="Filter by Roshen Available"
        options={roshenOptions}
        value={roshenFilter}
        onSelect={setRoshenFilter}
        allowClear="All"
      />
      <OptionSheet
        open={sheet === 'distributor'}
        onClose={() => setSheet(null)}
        title="Filter by Distributor"
        options={distributorOptions}
        value={distributorFilter}
        onSelect={setDistributorFilter}
        allowClear="All Distributors"
      />
    </Page>
  )
}
