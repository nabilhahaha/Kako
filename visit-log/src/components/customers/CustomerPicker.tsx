import { useMemo, useState } from 'react'
import { Plus, Store } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Customer } from '@/types'

export function filterCustomers(customers: Customer[], term: string): Customer[] {
  const query = term.trim().toLowerCase()
  if (!query) return customers
  return customers.filter((customer) =>
    [customer.name, customer.code, customer.city, customer.area, customer.phone]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(query)),
  )
}

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
  const filtered = useMemo(() => filterCustomers(customers, term), [customers, term])

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
      {filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title={term ? 'No matches' : 'No customers yet'}
          message={
            term
              ? 'Try a different name, code or city.'
              : 'Add customers manually or import them from Excel.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-card bg-surface-2/60">
          {filtered.map((customer) => (
            <button
              key={customer.id}
              onClick={() => pick(customer)}
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
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
