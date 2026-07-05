import { QueryClient } from '@tanstack/react-query'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'vl-query-cache',
  throttleTime: 1500,
})

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000
