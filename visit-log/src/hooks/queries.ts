import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCustomers,
  fetchCustomerSummaries,
  fetchCustomerCovers,
  fetchGalleryPhotos,
  fetchSignedUrls,
  fetchStats,
  fetchVisit,
  fetchVisits,
  searchEverything,
  type GalleryFilters,
  type VisitFilters,
} from '@/lib/api'
import { listPendingVisits, OUTBOX_EVENT } from '@/lib/outbox'
import { useAdminScope } from '@/hooks/useAdminScope'
import { VISIT_TYPE_META } from '@/lib/constants'
import { VISIT_TYPES, type VisitType } from '@/types'

export function useCustomers() {
  const { scopeParam } = useAdminScope()
  return useQuery({ queryKey: ['customers', scopeParam], queryFn: () => fetchCustomers(scopeParam) })
}

export function useCustomer(id: string | undefined) {
  const customers = useCustomers()
  return {
    ...customers,
    customer: id ? customers.data?.find((c) => c.id === id) : undefined,
  }
}

export function useVisits(filters: VisitFilters = {}) {
  const { scopeParam } = useAdminScope()
  const scoped: VisitFilters = { ...filters, scopeUserId: scopeParam }
  return useInfiniteQuery({
    queryKey: ['visits', scoped],
    queryFn: ({ pageParam }) => fetchVisits(scoped, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  })
}

export function useVisit(id: string | undefined) {
  return useQuery({
    queryKey: ['visit', id],
    queryFn: () => fetchVisit(id!),
    enabled: !!id,
  })
}

export function useGallery(filters: GalleryFilters = {}) {
  const { scopeParam } = useAdminScope()
  const scoped: GalleryFilters = { ...filters, scopeUserId: scopeParam }
  return useInfiniteQuery({
    queryKey: ['gallery', scoped],
    queryFn: ({ pageParam }) => fetchGalleryPhotos(scoped, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  })
}

export function useStats() {
  const { scopeParam } = useAdminScope()
  return useQuery({ queryKey: ['stats', scopeParam], queryFn: () => fetchStats(scopeParam), staleTime: 30 * 1000 })
}

export function useSignedUrls(paths: string[]) {
  const key = useMemo(() => [...paths].sort().join('|'), [paths])
  return useQuery({
    queryKey: ['signed-urls', key],
    queryFn: () => fetchSignedUrls(paths),
    enabled: paths.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  })
}

export function useVisitSearch(term: string) {
  const trimmed = term.trim().toLowerCase()
  const matchedTypes = useMemo(
    () =>
      trimmed.length < 2
        ? []
        : VISIT_TYPES.filter((t: VisitType) =>
            VISIT_TYPE_META[t].label.toLowerCase().includes(trimmed),
          ),
    [trimmed],
  )
  const { scopeParam } = useAdminScope()
  return useQuery({
    queryKey: ['search', trimmed, matchedTypes.join(','), scopeParam],
    queryFn: () => searchEverything(trimmed, matchedTypes, scopeParam),
    enabled: trimmed.length >= 2,
    staleTime: 15 * 1000,
  })
}

export function usePendingVisits() {
  const queryClient = useQueryClient()
  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['outbox'] })
    window.addEventListener(OUTBOX_EVENT, invalidate)
    return () => window.removeEventListener(OUTBOX_EVENT, invalidate)
  }, [queryClient])
  return useQuery({
    queryKey: ['outbox'],
    queryFn: listPendingVisits,
    staleTime: 0,
    gcTime: 60 * 1000,
  })
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useCustomerSummaries() {
  const { scopeParam } = useAdminScope()
  return useQuery({
    queryKey: ['customer-summaries', scopeParam],
    queryFn: () => fetchCustomerSummaries(scopeParam),
    staleTime: 30 * 1000,
  })
}

export function useCustomerCovers() {
  const { scopeParam } = useAdminScope()
  return useQuery({
    queryKey: ['customer-covers', scopeParam],
    queryFn: () => fetchCustomerCovers(scopeParam),
    staleTime: 60 * 1000,
  })
}
