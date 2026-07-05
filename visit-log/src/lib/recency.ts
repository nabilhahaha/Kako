import type { CustomerSummary } from '@/lib/api'

export type Recency = 'today' | 'week' | 'stale' | 'never'

export const RECENCY_META: Record<
  Recency,
  { label: string; color: string; dot: string; ring: string }
> = {
  today: { label: 'Visited today', color: '#34C759', dot: 'bg-ios-green', ring: 'ring-ios-green' },
  week: { label: 'Visited this week', color: '#FFCC00', dot: 'bg-ios-yellow', ring: 'ring-ios-yellow' },
  stale: { label: 'Not visited 7+ days', color: '#E30613', dot: 'bg-accent', ring: 'ring-accent' },
  never: { label: 'Never visited', color: '#8E8E93', dot: 'bg-ink-3', ring: 'ring-ink-3' },
}

const DAY = 24 * 60 * 60 * 1000

/** Buckets a customer's last-visit date into a marker recency band. */
export function recencyOf(lastVisitedAt: string | null | undefined): Recency {
  if (!lastVisitedAt) return 'never'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const visited = new Date(lastVisitedAt).getTime()
  if (visited >= startOfToday) return 'today'
  if (visited >= startOfToday - 6 * DAY) return 'week'
  return 'stale'
}

export function summaryRecency(summary: CustomerSummary | undefined): Recency {
  return recencyOf(summary?.lastVisitedAt)
}
