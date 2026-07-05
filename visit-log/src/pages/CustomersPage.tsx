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
import { ImportSheet } from '@/components/customers/ImportSheet'
import { filterCustomers } from '@/components/customers/CustomerPicker'
import { useCustomers } from '@/hooks/queries'
import { CUSTOMER_CATEGORY_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { CUSTOMER_CATEGORIES, type CustomerCategory } from '@/types'

const categoryOptions = CUSTOMER_CATEGORIES.map((value) => ({
  value,
  label: CUSTOMER_CATEGORY_LABELS[value],
}))

export function CustomersPage() {
  const customers = useCustomers()
  const [term, setTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategory | undefined>()
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const filtered = useMemo(() => {
    const byCategory = categoryFilter
      ? (customers.data ?? []).filter((c) => c.customer_category === categoryFilter)
      : customers.data ?? []
    return filterCustomers(byCategory, term)
  }, [customers.data, term, categoryFilter])

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
      <div className="mb-4 flex items-center gap-2">
        <div
          className={cn(
            'flex items-center overflow-hidden rounded-full text-[13px] font-semibold',
            categoryFilter ? 'bg-accent text-white' : 'bg-surface text-ink-2 shadow-card',
          )}
        >
          <button onClick={() => setCategoryOpen(true)} className="flex items-center gap-1.5 py-2 pl-3.5 pr-2">
            {categoryFilter ? CUSTOMER_CATEGORY_LABELS[categoryFilter] : 'Category'}
            {!categoryFilter && <ChevronDown size={13} />}
          </button>
          {categoryFilter && (
            <button
              onClick={() => setCategoryFilter(undefined)}
              aria-label="Clear category filter"
              className="py-2 pl-0.5 pr-3"
            >
              <X size={14} />
            </button>
          )}
        </div>
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
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-[16px] font-bold text-accent">
                    {customer.name.slice(0, 1).toUpperCase()}
                  </span>
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
        open={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="Filter by Category"
        options={categoryOptions}
        value={categoryFilter}
        onSelect={setCategoryFilter}
        allowClear="All Categories"
      />
    </Page>
  )
}
