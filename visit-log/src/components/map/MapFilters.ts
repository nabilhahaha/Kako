import type { CustomerSummary } from '@/lib/api'
import { recencyOf } from '@/lib/recency'

export type MapFilterId =
  | 'all'
  | 'today'
  | 'week'
  | 'follow_up'
  | 'never'
  | 'promotion'
  | 'display_check'
  | 'availability'
  | 'collection'

export const MAP_FILTERS: { id: MapFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Visited Today' },
  { id: 'week', label: 'Visited This Week' },
  { id: 'follow_up', label: 'Need Follow Up' },
  { id: 'never', label: 'Never Visited' },
  { id: 'promotion', label: 'Promotion' },
  { id: 'display_check', label: 'Display Check' },
  { id: 'availability', label: 'Availability' },
  { id: 'collection', label: 'Collection' },
]

export function matchesFilter(
  filter: MapFilterId,
  summary: CustomerSummary | undefined,
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'today':
      return recencyOf(summary?.lastVisitedAt) === 'today'
    case 'week': {
      const r = recencyOf(summary?.lastVisitedAt)
      return r === 'today' || r === 'week'
    }
    case 'follow_up':
      return !!summary?.hasFollowUp
    case 'never':
      return !summary || summary.visitCount === 0
    default:
      // Visit-type filters: customer has at least one visit of that type.
      return !!summary?.types.includes(filter)
  }
}
