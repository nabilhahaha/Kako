import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FileUp, Plus, Store } from 'lucide-react'
import { motion } from 'framer-motion'
import { Page, HeaderIconButton } from '@/components/layout/Page'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { CustomerForm } from '@/components/customers/CustomerForm'
import { ImportSheet } from '@/components/customers/ImportSheet'
import { filterCustomers } from '@/components/customers/CustomerPicker'
import { useCustomers } from '@/hooks/queries'

export function CustomersPage() {
  const customers = useCustomers()
  const [term, setTerm] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const filtered = useMemo(
    () => filterCustomers(customers.data ?? [], term),
    [customers.data, term],
  )

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
        placeholder="Search name, code, city…"
        className="mb-4"
      />

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
                    <span className="block truncate text-[13px] text-ink-2">
                      {[customer.code, customer.city, customer.area]
                        .filter(Boolean)
                        .join(' · ') || 'No details yet'}
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
    </Page>
  )
}
