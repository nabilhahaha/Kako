import type { QueryClient } from '@tanstack/react-query'
import { createVisit } from '@/lib/api'
import { listPendingVisits, removePendingVisit } from '@/lib/outbox'

let syncing = false

/**
 * Pushes visits queued while offline to Supabase. Safe to call repeatedly —
 * runs are serialized and items are only removed after a confirmed save.
 */
export async function syncOutbox(queryClient: QueryClient): Promise<number> {
  if (syncing || !navigator.onLine) return 0
  syncing = true
  let synced = 0
  try {
    const pending = await listPendingVisits()
    for (const item of pending) {
      try {
        await createVisit(
          {
            customer_id: item.customer_id,
            visited_at: item.visited_at,
            visit_type: item.visit_type,
            status: item.status,
            notes: item.notes,
            latitude: item.latitude,
            longitude: item.longitude,
          },
          { blob: item.storefront, takenAt: item.storefront_taken_at ?? item.visited_at },
          item.photos,
        )
        await removePendingVisit(item.localId)
        synced++
      } catch {
        // Still offline or a transient failure — leave the item queued and
        // stop; the next online event will retry from here.
        break
      }
    }
  } finally {
    syncing = false
  }
  if (synced > 0) {
    queryClient.invalidateQueries({ queryKey: ['visits'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['gallery'] })
  }
  return synced
}
