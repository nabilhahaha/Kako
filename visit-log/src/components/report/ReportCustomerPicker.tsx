import { useMemo, useState } from 'react'
import { Check, Store } from 'lucide-react'
import { Sheet } from '@/components/ui/Sheet'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { CategoryBadge } from '@/components/customers/CategoryBadge'
import { filterCustomers } from '@/components/customers/CustomerPicker'
import { cn } from '@/lib/utils'
import type { Customer } from '@/types'

/**
 * Customer selector for reports. In single mode a tap picks one customer and
 * closes; in multi mode taps toggle a checklist confirmed with Done.
 */
export function ReportCustomerPicker({
  open,
  onClose,
  customers,
  mode,
  selected,
  onChange,
}: {
  open: boolean
  onClose: () => void
  customers: Customer[]
  mode: 'single' | 'multi'
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [term, setTerm] = useState('')
  const filtered = useMemo(() => filterCustomers(customers, term), [customers, term])
  const chosen = new Set(selected)

  const toggle = (customer: Customer) => {
    if (mode === 'single') {
      onChange([customer.id])
      setTerm('')
      onClose()
      return
    }
    const next = new Set(chosen)
    if (next.has(customer.id)) next.delete(customer.id)
    else next.add(customer.id)
    onChange(Array.from(next))
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'single' ? 'Select Customer' : 'Select Customers'}
      tall
    >
      <div className="sticky top-0 z-10 -mx-1 bg-surface px-1 pb-3">
        <SearchInput value={term} onChange={setTerm} placeholder="Name, code, city…" />
      </div>

      {mode === 'multi' && (
        <p className="mb-2 px-1 text-[13px] font-semibold text-ink-2">
          {selected.length} selected
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title={term ? 'No matches' : 'No customers yet'}
          message={term ? 'Try a different name, code or city.' : 'Add customers to build reports.'}
        />
      ) : (
        <div className="overflow-hidden rounded-card bg-surface-2/60">
          {filtered.map((customer) => {
            const active = chosen.has(customer.id)
            return (
              <button
                key={customer.id}
                onClick={() => toggle(customer)}
                className="flex w-full items-center gap-3 border-b border-separator/60 px-4 py-3.5 text-left last:border-b-0 active:bg-surface-2"
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    active ? 'border-accent bg-accent text-white' : 'border-separator text-transparent',
                  )}
                >
                  <Check size={15} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{customer.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <CategoryBadge customer={customer} />
                    <span className="truncate text-[13px] text-ink-2">
                      {[customer.code, customer.city].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {mode === 'multi' && (
        <button
          onClick={onClose}
          disabled={selected.length === 0}
          className="press mt-4 flex h-[52px] w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-bold text-white shadow-fab disabled:opacity-50"
        >
          Done{selected.length > 0 ? ` · ${selected.length}` : ''}
        </button>
      )}
    </Sheet>
  )
}
