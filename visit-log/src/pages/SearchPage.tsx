import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, SearchX, Search } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { VisitCard, useVisitThumbs } from '@/components/visits/VisitCard'
import { filterCustomers } from '@/components/customers/CustomerPicker'
import { useCustomers, useDebouncedValue, useVisitSearch } from '@/hooks/queries'

export function SearchPage() {
  const [term, setTerm] = useState('')
  const debounced = useDebouncedValue(term, 250)
  const customersQuery = useCustomers()
  const search = useVisitSearch(debounced)

  const matchedCustomers = useMemo(() => {
    if (debounced.trim().length < 2) return []
    return filterCustomers(customersQuery.data ?? [], debounced).slice(0, 6)
  }, [customersQuery.data, debounced])

  const visits = search.data?.visits ?? []
  const thumbs = useVisitThumbs(visits)
  const active = debounced.trim().length >= 2
  const nothingFound =
    active && !search.isFetching && matchedCustomers.length === 0 && visits.length === 0

  return (
    <Page title="Search" back="/">
      <SearchInput
        value={term}
        onChange={setTerm}
        placeholder="Customers, codes, notes, visit types…"
        autoFocus
        className="mb-5"
      />

      {!active ? (
        <EmptyState
          icon={Search}
          title="Search everything"
          message="Find customers by name or code, and visits by notes or visit type."
        />
      ) : (
        <div className="space-y-6">
          {matchedCustomers.length > 0 && (
            <section>
              <h3 className="mb-2 px-1 text-[15px] font-bold text-ink-2">Customers</h3>
              <div className="overflow-hidden rounded-card bg-surface shadow-card">
                {matchedCustomers.map((customer) => (
                  <Link
                    key={customer.id}
                    to={`/customers/${customer.id}`}
                    className="flex items-center gap-3 border-b border-separator/60 px-4 py-3 last:border-b-0 active:bg-surface-2"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-[15px] font-bold text-accent">
                      {customer.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {customer.name}
                      </span>
                      <span className="block truncate text-[13px] text-ink-2">
                        {[customer.code, customer.city].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-ink-3" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {search.isFetching && visits.length === 0 ? (
            <Spinner />
          ) : (
            visits.length > 0 && (
              <section>
                <h3 className="mb-2 px-1 text-[15px] font-bold text-ink-2">Visits</h3>
                <div className="space-y-3">
                  {visits.map((visit, index) => (
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      index={index}
                      thumbUrl={
                        visit.photos[0] ? thumbs[visit.photos[0].storage_path] : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            )
          )}

          {nothingFound && (
            <EmptyState
              icon={SearchX}
              title="No results"
              message={`Nothing matches “${debounced.trim()}” — try another word.`}
            />
          )}
        </div>
      )}
    </Page>
  )
}
